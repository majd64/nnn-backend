const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const cors = require("cors")
require("dotenv").config()
let User = require("./models/user.model");
var nodemailer = require('nodemailer');
const MongoStore = require('connect-mongo')(session);

const app = express();

mongoose.connect("mongodb+srv://admin:" + process.env.DATABASEPASS + "@cluster0.xpbd4.mongodb.net/NNNUsers?retryWrites=true&w=majority", {
  useNewUrlParser: true,
  useUnifiedTopology: true
});
mongoose.set("useCreateIndex", true);

app.use(cors({origin: "http://localhost:3000", credentials: true}));
app.use(bodyParser.urlencoded({
  extended: true
}));
app.use(session({
  secret: process.env.SECRET,
  store: new MongoStore({ mongooseConnection: mongoose.connection })
  resave: false,
  saveUninitialized: false
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

app.post("/login", function(req, res) {
  console.log("attemp to verify")
  console.log(req.body.email)
  console.log(req.body.password)
  const user = new User({
    email: req.body.email,
    password: req.body.password
  });
  req.login(user, function(err) {
    if (err) {
      res.send("Nuts! An unknown error occured")
    } else {
      console.log("attempt to auth")
      passport.authenticate("local")(req, res, function() {
        res.send("success")
      });
    }
  });
});

app.post("/register", function(req, res) {
  if (req.body.username == null || req.body.username == ""){
    res.send("Username is required");
    return;
  }
  else if (req.body.email == null || req.body.email == ""){
    res.send("Email is required");
    return;
  }
  else if (req.body.password == null || req.body.password == ""){
    res.send("Password is required");
    return;
  }
  else if (req.body.password != req.body.password2){
    res.send("Passwords do not match");
    return;
  }
  else if (req.body.password.length < 6){
    res.send("Passwords must be at least 6 characters long");
    return;
  }
  else if (!isEmailValid(req.body.email)){
    res.send("Invalid email address");
    return;
  }
  User.register(new User({
    email: req.body.email,
    username: req.body.username
  }), req.body.password, function(err, user) {
    if (err) {
      if (err.name === "UserExistsError"){
        res.send("This email already exists")
      }
      else if (err.name === "MongoError"){
        res.send("This username already exists")
      }
      else{
        res.send("Nuts! An unknown error occured")
      }
    } else {

      passport.authenticate("local")(req, res, function() {
        var mailOptions = {
          from: process.env.NODEMAILERUSER,
          to: user.email,
          subject: 'NNN Verify Email',
          text: 'Thank you for registering for NNN click the following link to verify your email: http://localhost:5000/verifyemail/' + user.emailVerificationHash
        };

        transporter.sendMail(mailOptions, function(error, info){
          if (error) {
            console.log(error);
          } else {
            console.log('Email sent: ' + info.response);
          }
        });
        res.send("success")
      });
    }
  });
});


app.get('/verifyemail/:emailverificationhash', function (req, res) {
  console.log(req.params.hash)
  User.findOne({
    emailVerificationHash: req.params.emailverificationhash
  }, function(err, user) {
    if (user) {
      user.emailVerified = true;
      user.save();
      res.redirect("http://localhost:3000/login")
    } else {
      res.send("cannot find user")
    }
  })
})



app.get("/logout", function(req, res) {
  req.logout();
  res.send("success")
});

app.route("/user/auth")
  .get(function(req, res){
    if (req.isAuthenticated()) {
      res.send("true")
    } else {
      res.send("false")
    }
  });


app.route("/user")
  .get(function(req, res) {
    if (req.isAuthenticated()) {
      User.findOne({
        id: req.body.id
      }, function(err, user) {
        if (user) {
          res.send(user)
        } else {
          res.send("cannot find user")
        }
      })
    } else {
      res.send("no auth");
    }
  })

  .patch(function(req, res) {
    if (req.isAuthenticated()) {
      User.update({
          id: req.body.id
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
  })

app.post("/user/changepassword", function(req, res) {
  if (req.isAuthenticated()) {
    User.findOne({
      id: req.body.id
    }, function(err, user) {
      if (user) {
        user.setPassword(req.body.newpassword, function(){
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
})

app.listen(process.env.PORT || 5000, function() {
  console.log("Server started.");
});

var emailRegex = /^[-!#$%&'*+\/0-9=?A-Z^_a-z{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;
function isEmailValid(email) {
    if (!email)
        return false;

    if(email.length>254)
        return false;

    var valid = emailRegex.test(email);
    if(!valid)
        return false;

    // Further checking of some things regex can't handle
    var parts = email.split("@");
    if(parts[0].length>64)
        return false;

    var domainParts = parts[1].split(".");
    if(domainParts.some(function(part) { return part.length>63; }))
        return false;

    return true;
}
