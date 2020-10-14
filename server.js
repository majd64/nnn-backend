const express = require("express");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const nodemailer = require('nodemailer');
require("dotenv").config();
const MongoStore = require('connect-mongo')(session);
let User = require("./models/user.model");
let isEmailValid = require("./isEmailValid");
const path = require('path');

const app = express();

mongoose.connect("mongodb+srv://admin:" + process.env.DBPASS + "@cluster0.xpbd4.mongodb.net/" + process.env.DBNAME + "?retryWrites=true&w=majority", { useNewUrlParser: true, useUnifiedTopology: true});
mongoose.set("useCreateIndex", true);

app.set('trust proxy', 1);
app.use(express.static(path.join(__dirname, 'build')));
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
  service: 'gmail',
  auth: {
    user: process.env.NODEMAILERUSER,
    pass: process.env.NODEMAILERPASS
  }
});

app.post("/api/login", function(req, res) {
  console.log("login reached")
  const user = new User({
    email: req.body.email,
    password: req.body.password
  });
  req.login(user, function(err) {
    if (err) {
      console.log(err);
      res.send("Nuts! An unknown error occured");
    } else {
      passport.authenticate("local")(req, res, function() {
        res.send("success");
      });
    }
  });
});

app.post("/api/register", function(req, res) {
  if (req.body.username == null || req.body.username == "") {
    res.send("Username is required");
    return;
  } else if (req.body.email == null || req.body.email == "") {
    res.send("Email is required");
    return;
  } else if (req.body.password == null || req.body.password == "") {
    res.send("Password is required");
    return;
  } else if (req.body.password != req.body.password2) {
    res.send("Passwords do not match");
    return;
  } else if (req.body.password.length < 6) {
    res.send("Passwords must be at least 6 characters long");
    return;
  } else if (!isEmailValid(req.body.email)) {
    res.send("Invalid email address");
    return;
  }
  User.register(new User({
    email: req.body.email,
    username: req.body.username
  }), req.body.password, function(err, user) {
    if (err) {
      console.log(err)
      if (err.name === "UserExistsError") {
        res.send("This email already exists")
      } else if (err.name === "MongoError") {
        res.send("This username already exists")
      } else {
        res.send("Nuts! An unknown error occured")
      }
    } else {
      passport.authenticate("local")(req, res, function() {
        var mailOptions = {
          from: process.env.NODEMAILERUSER,
          to: user.email,
          subject: 'NN Email Verification',
          text: 'Thank you for registering for NNN click the following link to verify your email: https://nnn-server.herokuapp.com/verifyemail/' + user.emailVerificationHash
        };
        transporter.sendMail(mailOptions, function(error, info) {
          if (error) {
            console.log(error);
          }
        });
        res.send("success");
      });
    }
  });
});

app.get("/api/logout", function(req, res) {
  req.logout();
  res.send("success")
});

app.route("/api/user")
  .get(function(req, res) {
    if (req.isAuthenticated()) {
      User.findOne({
        _id: req.user._id
      }, function(err, user) {
        if (user) {
          res.send(user)
        } else {
          res.send("cannot find user")
        }
      });
    } else {
      res.send("no auth");
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
            res.send("success");
          } else {
            res.send(err);
          }
        }
      );
    } else {
      res.send("no auth");
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
            if (err){
              console.log(err);
            }else{
              res.send({"friends" : friends})
            }
          });
        } else {
          res.send("cannot find user")
        }
      })
    } else {
      res.send("no auth");
    }
  });

app.post("/api/user/addfriend", function(req, res){
  console.log("add friend")
  console.log(req.body.newfriendusername)
  if (req.isAuthenticated()) {
    User.findOne({
      username: req.body.newfriendusername
    }, function(err, user) {
      if (user) {
        user.incomingFriendRequests.push(req.user._id);
        user.save();
        res.send("success")
      } else {
        res.send("failure")
      }
    })
  } else {

  }
})

app.get("/api/user/auth", function(req, res) {
  if (req.isAuthenticated()) {
    res.send("true")
  } else {
    res.send("false")
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
          res.send("success")
        });
      } else {
        res.send("cannot find user")
      }
    })
  } else {
    res.send("no auth")
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
    function(err, result) {
      if (err) {
        res.send(err)
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
