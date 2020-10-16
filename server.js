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

mongoose.connect(`mongodb+srv://admin:${process.env.DBPASS}@cluster0.xpbd4.mongodb.net/${process.env.DBNAME}?retryWrites=true&w=majority`, { useNewUrlParser: true, useUnifiedTopology: true, autoIndex: true});
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
      console.log(err);
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
          text: `Thank you for registering for NNN click the following link to verify your email: https://nnn-server.herokuapp.com/api/user/verifyemail/${user._id}/${user.emailVerificationHash}`
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
        }
      });
    }else{
      res.send({"status": "error"});
    }
  })

app.route("/api/user/friends")
  .get(function(req, res){
    if (req.isAuthenticated()) {
      User.findOne({
        _id: req.user._id
      }, function(err, user) {
        if (user) {
          let response = {"status": "success", "friends": [], "friendRequests": []}
          User.find({
            _id: { $in: user.friends.map(a => a.id)}
          }, function(err, friends){
            response.friends = friends;
            User.find({
              _id: { $in: user.incomingFriendRequests}
            }, function(err, requests){
              response.friendRequests = requests;
              res.send(response);
            });
          });
        }
      });
    }
  });

app.post("/api/user/friends/sendFriendRequest", async(req, res) => {
  if (req.isAuthenticated()) {
    User.findOne({username: req.body.newfriendusername.trim()}, async function(err, friend) {
      if (friend) {
        User.findOne({
          _id: req.user._id
        }, async function(err, user) {
          if (user) {
            if (user.username === friend.username){
              res.send({"status": "error", "message": "you cannot add yourself"});
            }
            else if (user.friends.filter(fr => {return fr.id.equals(friend._id)}).length != 0){
              res.send({"status": "error", "message": "you are already friends"});
            }
            else if(user.outgoingFriendRequests.includes(friend._id)){
              res.send({"status": "error", "message": "you already sent a request to this user"});
            }
            else if (user.incomingFriendRequests.includes(friend._id)){
              res.send({"status": "error", "message": "you already have a request from this user"});
            }else{
              friend.incomingFriendRequests.push(user._id);
              user.outgoingFriendRequests.push(friend._id);
              await friend.save();
              await user.save();
              res.send({"status": "success"});
            }
          }
        });
      }
    });
  }
});

app.post("/api/user/friends/friendRequest/:acceptfriend", async (req, res) => {
  if (req.isAuthenticated()){
    User.findOne({_id: req.user._id}, async (err, user) => {
      if (user){
        User.findOne({_id: req.body.friendId}, async (err, friend) => {
          if (friend){
            user.incomingFriendRequests.pull({_id: req.body.friendId});
            friend.outgoingFriendRequests.pull({_id: req.user._id});
            if (req.params.acceptfriend === "true"){
              user.friends.push({id: friend._id, messages: []});
              friend.friends.push({id: user._id, messages: []});
              var mailOptions = {
                from: process.env.NODEMAILERUSER,
                to: user.email,
                subject: `${friend.username} Accepted Your Friend Request`,
                text: `${friend.username} accepted your request`
              };
              transporter.sendMail(mailOptions, function(error, info) {
                if (error) {
                  console.log(error);
                }
              });
            }
            await user.save();
            await friend.save();
            res.send({"status": "success"})
          }else{
            res.send({"status": "error", "message": "cannot find friend"});
          }
        });
      }
    });
  }
});

app.get("/api/user/friends/messages/:friendID", (req, res) => {
  if (req.isAuthenticated){
    User.findOne({_id: req.user._id}, (err, user) => {
      if (user){
        var friend = user.friends.filter(fr => {
          return fr.id === req.params.friendID
        });
        if (friend.length > 0){
          res.send({status: "success", messages: friend.messages})
        }else{
          res.send({status: "error", message: "friend not found"})
        }
      }
    })
  }
});

app.post("/api/user/friends/sendMessage", async () => {
  if (req.isAuthenticated()){
    User.findOne({_id: req.user._id}, async(err, user) => {
      if (user){
        var friend = user.friends.filter(fr => {
          return fr.id === req.body.friendID
        });
        if (friend.length > 0){
          friends[0].messages.push({message: req.body.message, sender: true, timestamp: Date.now()})
        }
        user.save();
        User.findOne({_id: req.user.friendID}, async(err, friend) => {
          if (friend){
            var sender = friend.friends.filter(fr => {
              return fr.id === req.user._id
            });
            if (sender.length > 0){
              sender[0].messages.push({message: req.body.message, sender: false, timestamp: Date.now()})
            }
            friend.save();
          }
        });
      }
    });
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
      }
    })
  }
});

app.get('/api/user/verifyemail/:userid/:emailverificationhash', function(req, res) {
  User.findOne({
    "_id": req.params.userid
  }, function(err, user){
    if (user){
      if (user.emailVerificationHash === req.params.emailverificationhash){
        user.emailVerified = true;
        user.save();
        res.redirect("/login")
      }else{
        res.send({"status": "error", "message": "wrong hash"})
      }
    }else{
      res.send({"status": "error", "message": "cannot find user"})
    }
  })
});

app.get('/*', (req, res) => {
  res.sendFile(path.join(__dirname, 'build', 'index.html'));
});

app.listen(process.env.PORT || 5000, function() {
  console.log("Server started");
});
