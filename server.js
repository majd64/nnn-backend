const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const nodemailer = require("nodemailer");
require("dotenv").config();
const MongoStore = require("connect-mongo")(session);
let User = require("./models/user.model");
let isEmailValid = require("./isEmailValid");
const path = require("path");

const app = express();

mongoose.connect(`mongodb+srv://admin:${process.env.DBPASS}@cluster0.xpbd4.mongodb.net/${process.env.DBNAME}?retryWrites=true&w=majority`, { useNewUrlParser: true, useUnifiedTopology: true});
mongoose.set("useCreateIndex", true);

app.use(express.static(path.join(__dirname, "build")));
app.use(bodyParser.urlencoded({extended: true}));

app.use(session({
  secret: process.env.SECRET,
  resave: false,
  saveUninitialized: false,
  store: new MongoStore({
    mongooseConnection: mongoose.connection
  }),
}));

app.use(passport.initialize());
app.use(passport.session());

passport.use(User.createStrategy());
passport.serializeUser(function(user, done) {
  done(null, user.id);
});

passport.deserializeUser(function(id, done) {
  User.findById(id, function(err, user) {
    done(err, user);
  });
});

var transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.NODEMAILERUSER,
    pass: process.env.NODEMAILERPASS
  }
});

app.post("/api/login", function(req, res) {
  const user = new User({
    email: req.body.email,
    password: req.body.password
  });
  req.login(user, function(err) {
    if (err) {
      res.send({"status": "error", "message": "an unknown error occured"});
    } else {
      passport.authenticate("local")(req, res, function() {
        res.send({"status": "success"});
      });
    }
  });
});

app.post("/api/register", function(req, res) {
  if (req.body.username == null || req.body.username == "") {
    res.send({"status": "error", "message": "username is required"});
    return;
  } else if (req.body.email == null || req.body.email == "") {
    res.send({"status": "error", "message": "email is required"});
    return;
  } else if (req.body.password == null || req.body.password == "") {
    res.send({"status": "error", "message": "password is required"});
    return;
  } else if (req.body.password != req.body.password2) {
    res.send({"status": "error", "message": "passwords do not match"});
    return;
  } else if (req.body.password.length < 6) {
    res.send({"status": "error", "message": "password must be at least 6 characters long"});
    return;
  } else if (!isEmailValid(req.body.email)) {
    res.send({"status": "error", "message": "invalid email"});
    return;
  }
  User.register(new User({
    email: req.body.email,
    username: req.body.username
  }), req.body.password, function(err, user) {
    if (err) {
      if (err.name === "UserExistsError") {
        res.send({"status": "error", "message": "email already exists"});
      } else if (err.name === "MongoError") {
        res.send({"status": "error", "message": "username taken"});
      } else {
        res.send({"status": "error", "message": "unknown error"});
      }
    } else {
      passport.authenticate("local")(req, res, function() {
        var mailOptions = {
          from: process.env.NODEMAILERUSER,
          to: user.email,
          subject: "NN Email Verification",
          text: `Thank you for registering for NNN click the following link to verify your email: https://nnn-server.herokuapp.com/verifyemail/${user.emailVerificationHash}`
        };
        transporter.sendMail(mailOptions, function(error, info) {
          if (error) {
            console.log(error);
          }
        });
        res.send({"status": "success"});
      });
    }
  });
});

app.get("/api/logout", function(req, res) {
  req.logout();
  res.send({"status": "success"})
});

app.route("/api/user")
  .get(function(req, res) {
    if (req.isAuthenticated()) {
      User.findOne({
        _id: req.user._id
      }, function(err, user) {
        if (user) {
          res.send({"status": "success", "user": user});
        } else {
          res.send({"status": "error", "message": "cannot find user"});
        }
      });
    }
  })
  .patch(function(req, res) {
    if (req.isAuthenticated()) {
      User.update({
          _id: req.user._id
        }, {
          $set: req.body
        },
        function(err) {
          if (!err) {
            res.send({"status": "success"});
          } else {
            res.send({"status": "error"});
          }
        }
      );
    }
  });

app.route("/api/user/friends")
  .get(function(req, res){
    if (req.isAuthenticated()) {
      User.findOne({
        _id: req.user._id
      }, function(err, user) {
        if (user) {
          User.find({
            _id: { $in: user.friends}
          }, function(err, friends){
            res.send({"status": "success", "friends" : friends})
          });
        } else {
          res.send({"status": "error", "message": "cannot find user"});
        }
      })
    }
  });

app.post("/api/user/addfriend", function(req, res){
  if (req.isAuthenticated()) {
    User.findOne({
      username: req.body.newfriendusername.trim()
    }, function(err, friend) {
      if (friend) {
        friend.incomingFriendRequests.push(req.user._id);
        friend.save();
        User.findOne({
          _id: req.user._id
        }, function(err, user) {
          if (user) {
            user.outgoingFriendRequests.push(friend._id);
            user.save();
            res.send({"status": "success"})
          } else {
            res.send({"status": "error", "message": "cannot find user"});
          }
        })
      } else {
        res.send({"status": "error", "message": "cannot find user"});
      }
    });
  }
})

app.get("/api/user/auth", function(req, res) {
  if (req.isAuthenticated()) {
    res.send({"status": "success"})
  } else {
    res.send({"status": "error"})
  }
});

app.post("/api/user/changepassword", function(req, res) {
  if (req.isAuthenticated()) {
    User.findOne({
      _id: req.user._id
    }, function(err, user) {
      if (user) {
          user.setPassword(req.body.newpassword, function() {
          user.save();
          res.send({"status": "success"});
        });
      } else {
        res.send({"status": "error", "message": "cannot find user"})
      }
    })
  }
});

app.get('/verifyemail/:emailverificationhash', function(req, res) {
  User.updateOne({
      emailVerificationHash: req.params.emailverificationhash
    }, {
      $set: {
        "emailVerified": true
      }
    },
    function(err) {
      if (err) {
        res.send({"status": "error", "message": "unknown error"})
      } else {
        res.redirect("/")
      };
    });
});

app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(process.env.PORT || 5000, function() {
  console.log("Server started");
});
