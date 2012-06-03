/**
 * @author Hank
 */


//var memberList = [];
var app = require('http').createServer();
var io = require('socket.io').listen(app, {origins: '*:*'});
var port = process.env.PORT || 80;
app.listen(port);
//var userName = "";
var lobby = [];
var matchRoom = [];
var json = JSON.stringify;

// assuming io is the Socket.IO server object
io.configure(function () {
  io.set("transports", ["xhr-polling"]);
  //io.set("polling duration", 10);
  //io.set("close timeout", 10);
  io.set('log', false);
});

//database test
var mongo = require('mongoose');
var mongoURI = 'mongodb://heroku_app4863042:67h5m3kki74hd9k3roo0ufnl44@ds033307.mongolab.com:33307/heroku_app4863042';
mongo.connect(mongoURI);
mongo.connection.on("open", function() {
	console.log("connection open");
});
var Schema = mongo.Schema;

// Schema
// use this for login info
mongo.model('loginInfo', new Schema({username:String,
									 password:String},
									{collection:'users'}));
									
// use this one for	getting currency, exp, and avatar img
mongo.model('infoDisplay', new Schema({username:String,
									   exp:Number,
									   currency:Number,
									   avatar:String},
									  {collection:'users'}));
									
// use this one for getting deck information
/*
mongo.model('deckInfo', new Schema({username:String,
								    userid:String},
								   {collection:'users'}));
*/
// use this one for getting hands
mongo.model('handInfo', new Schema({username:String,
									cards:{}},
								   {collection:'hands'}));

// use this one for getting player's collection (collection is a reserve word so use collect instead)
mongo.model('collectInfo', new Schema({username:String,
									   cards:{}},
									  {collection:'collect'}));

// monster cards
mongo.model('monster_cards', new Schema({cardID:String,
										 name:String,
										 hp:Number,
										 ap:Number,
										 cp:Number,
										 sp:Number,
										 ability:Number,
										 affiliation:String,
										 opposition:String,
										 image:String,
										 description:String,
										 notes:String},
								   		{collection:'monster_cards'}));
//server function
io.sockets.on('connection', function(socket) {
	//socket.emit('message', "Face");
	console.log("Connected...");
	socket.on('message', function(message) {
		console.log("Message in:" + message.toString());
		//console.log("ASDFASDF");
		var inputMessage = JSON.parse(message);//message.split(",");
		
		// check login
		if(inputMessage.type == "loginString") {
			//memberList.push(temp[1]);
			var username = inputMessage.username;
			var password = inputMessage.password;
			//var temp1 = false;
			//console.log("start checking auth...");
			//mongo.connection.on("open", function() {
				//console.log("open?");
			var userinfo = mongo.model('loginInfo');
			userinfo.find({'username':username}, ['username','password'], function(err, data) {
				//console.log("in query");
				
				var isOnline = false;
				findIsOnline:
				for(var i = 0; i < lobby.length; i++) {
					if(lobby[i].username == username) {
						isOnline = true;
						break findIsOnline;
					}
				}
				
				if(data.length != 0) {
					if(data[0].password == password && !isOnline) {
						socket.send(json({login:"true"}));
						lobby.push(new Player(username, lobby.length, socket));
						for(var i = 0; i < lobby.length-1; i++) {
							lobby[i].socket.send(json({
								type:"EnterRoom",
								id:username
							}));
						}
						
					}
				}
			});
		}
		
		// get avatar information
		if(inputMessage.type == "getAvatarInfo") {
			var username = inputMessage.username;
			var infoDisplay = mongo.model('infoDisplay');
			infoDisplay.find({'username':username}, ['exp','currency','avatar'], function(err, data) {
				var exp = data[0].exp;
				var currency = data[0].currency;
				var avatar = data[0].avatar;
				socket.send(json({
					type:'avatarInfo',
					currency:currency,
					exp:exp,
					avatar:avatar
				}));
			});
		}
		
		// messages
		if(inputMessage.type == "sendMes") {
			var username = inputMessage.username;
			var message = inputMessage.message;
			var brodcastMes = json({
				type:"NewMessage",
				username:username,
				message:message
			});
			var i;
			for(i = 0; i < lobby.length; i++) {
				
				//lobby[i].emit('message', temp);
				lobby[i].socket.send(brodcastMes);
				//console.log(temp);
			}
			
			//socket.broadcast.emit('message', temp);
		}
		
		// get memberlist
		if(inputMessage.type == "getList") {
			var memberList = [];
			var i;
			for(i = 0; i < lobby.length; i++) {
				memberList.push(lobby[i].username);
			}
			//var returnVar = 'getList,'+ memberList;
			var returnVar = json({
				type:"getList",
				count:memberList.length,
				list:memberList
			});
			socket.send(returnVar);
		}
		
		//socket.send('Echo: ' + message.toString());
		//socket.emit('message', "Face");
		
		// challenge message
		if(inputMessage.type == "Challenge") {
			
			var Player1 = inputMessage.challenger;
			var Player2 = inputMessage.receiver;
			
			var i;
			findUser:
			for(i = 0; i < lobby.length; i++) {
				//console.log(lobby[i].username);
				if(lobby[i].username == Player2) {
					//isChallenged = true;
					//console.log("find opponent: " + Player2);
					//lobby[i].socket.send("challengeMes," + Player1);
					lobby[i].socket.send(json({
						type:"challengeMes",
						challenger:Player1
					}));
					break findUser;
				}
			}
		}
		
		// challenge denied
		if(inputMessage.type == "challengeDenied") {
			
			var receiver = inputMessage.receiver;
			var challenger = inputMessage.challenger;
			var DeniedJson = json({
				type:"challengeDenied",
				deniedBy:receiver
			});
			findUser:
			for(var i = 0; i < lobby.length; i++) {
				if(lobby[i].username == challenger) {
					lobby[i].socket.send(DeniedJson);
					break findUser;
				}
			}
		}
		
		// challenge accept
		if(inputMessage.type == "challengeAccept") {
			var receiver = inputMessage.receiver;
			var challenger = inputMessage.challenger;
			//console.log("Accept", receiver, challenger);
			// get socket of 2 players
			var player1Socket, player2Socket;
			var find1 = false, find2 = false;
			
			// find player1
			finishSocketFinding:
			for(var i = 0; i < lobby.length; i++) {
				if(find1 & find2)
					break finishSocketFinding;
				else {
					if(lobby[i].username == receiver) {
						player1Socket = lobby[i].socket;
						find1 = true;
						//console.log("Find receiver", player1Socket);
					}
					if(lobby[i].username == challenger) {
						player2Socket = lobby[i].socket;
						find2 = true;
						//console.log("Find challenger", player2Socket);
					}
				}
			}
			
			//console.log("finish finding players")
			//console.log("point break: " + player1Socket.toString() + ", " + player2Socket.toString());
			// find a matchRoom for 2 players
			//console.log("Room: " + matchRoom[i]);
			var roomIndex = matchRoom.length;
			console.log("Get RoomIndex:", roomIndex);
			matchRoom.push(new match(roomIndex, player1Socket, player2Socket));
			console.log("Joined in room:", matchRoom[0].RoomId);
			// enter room
			var startDualJson = json({
				type:"startDual",
				roomIndex:roomIndex
			});
			//console.log("Dual Message Sent");
			player1Socket.send(startDualJson);
			player2Socket.send(startDualJson);

		}
		
		// matchRoom event handler
		if(inputMessage.type == "battle") {
			
			// get room
			var roomid = inputMessage.roomid;
			var call = inputMessage.call;
			var room;
			console.log("RoomID:", roomid);
			findRoom:
			for(var i = 0; i < matchRoom.length; i++) {
				if(matchRoom[i].RoomId == roomid) {
					room = matchRoom[i];
					console.log("room found");
					break findRoom;
				}
			}
			console.log("RoomID:",room.RoomId);
			// get player
			var player;
			if(socket == room.Player1)
				player = 1;
			else
				player = 2;
			
			// setup room
			if(call == "roomSetup") {
				if(player == 1) {
					var userName = inputMessage.username;
					var handInfo = mongo.model('handInfo');
					//var userInfo = mongo.model('deckInfo');
					//room.player1Hand = getDeck(userName);
					handInfo.find({username:userName},['cards'],function(err, data) {
						//console.log("P1HandInfo", data);
						var hands = data[0].cards;
						console.log("p1 hands:", hands);
						for(var i = 0; i < 5; i++) {
							room.player1Hand.push(new Card(hands[i].name, hands[i].hp, hands[i].ap, hands[i].sp, 'http://interactive.asu.edu'+hands[i].image));
						}
						room.Player1.send(json({
								type:"cardReady"
						}));
					});
				}
				if(player == 2) {
					var userName = inputMessage.username;
					var handInfo = mongo.model('handInfo');
					//var userInfo = mongo.model('deckInfo');
					//room.player2Hand = getDeck(userName);
					handInfo.find({username:userName},['cards'],function(err, data) {
						//console.log("P2HandInfo", data, data.length);
						var hands = data[0].cards;
						console.log("p2 hands:", hands);
						for(var i = 0; i < 5; i++) {
							room.player2Hand.push(new Card(hands[i].name, hands[i].hp, hands[i].ap, hands[i].sp, 'http://interactive.asu.edu'+hands[i].image));
						}
						room.Player2.send(json({
								type:"cardReady"
						}));
					});
				}
					
			}
			
			// card ready
			if(call == "placeCard") {
				if(player == 1) {
					room.player1Card = inputMessage.card;
					room.player1Ready = true;
				}
				else {
					room.player2Card = inputMessage.card;
					room.player2Ready = true;
				}
				
				// check if both sides are ready
				if(room.player1Ready && 
				   room.player2Ready) {
				   	// compareCard
				   	room.Player1.send(json({
				   		type:"sendCard",
				   		cardToSend:room.player2Card
				   	}));
				   	room.Player2.send(json({
				   		type:"sendCard",
				   		cardToSend:room.player1Card
				   	}));
				   }
			}
			
			// get card information
			if(call == "getCardInfo") {
				var userName = inputMessage.username;
				//var index = temp[4];
				var result;
				//console.log("index: " + index);
				if(player == 1) {
					var tempHand = room.player1Hand;
					//socket.send("cardInfo,"+tempHand);
					var tempJson = json({
						type:"cardInfo",
						hand:tempHand
					});
					socket.send(tempJson);
					//console.log(tempJson);
				}
				else {
					var tempHand = room.player2Hand;
					//socket.emit('message',"cardInfo,"+tempHand);
					var tempJson = json({
						type:"cardInfo",
						hand:tempHand
					});
					socket.send(tempJson);
					//console.log(tempJson);
				}
			}
			
			// get enemy's card information
			if(call == "getEnemyCard") {
				var cardIndex = inputMessage.card-5;
				/*
				console.log("CardIndex: " + cardIndex);
				console.log("Card: " + 
							matchRoom[room].player2Hand[cardIndex].getString());
							*/
				if(player == 1) {
					console.log("Player: 1 CardIndex: " + cardIndex);
					var cardInfo = room.player2Hand[cardIndex];
					//socket.send("enemyCardInfo,"+room.player2Hand[cardIndex].getString()+","+temp[3]);
					socket.send(json({
						type:"enemyCardInfo",
						cardID:cardIndex+5,
						Name:cardInfo.cardName,
						HP:cardInfo.HP,
						AP:cardInfo.ATK,
						SP:cardInfo.SP,
						img:cardInfo.imgLink
					}));
				}
					
				else {
					console.log("Player: 2 CardIndex: " + cardIndex);
					var cardInfo = room.player1Hand[cardIndex];
					//socket.emit('message',"enemyCardInfo,"+room.player1Hand[cardIndex].getString()+","+temp[3]);
					socket.send(json({
						type:"enemyCardInfo",
						cardID:cardIndex+5,
						Name:cardInfo.cardName,
						HP:cardInfo.HP,
						AP:cardInfo.ATK,
						SP:cardInfo.SP,
						img:cardInfo.imgLink
					}));
				}
					
			}
			
			// compare 2 cards
			if(call == "getCardResult") {
				var p1Card = room.player1Card - 6,
				    p2Card = room.player2Card - 6;
				//console.log("inputCardIndex: " + matchRoom[room].player1Card);
				//console.log("inputCard: " + matchRoom[room].player1Hand[p1Card].getString());
				var result = getCardResult(room.player1Hand[p1Card], room.player2Hand[p2Card]);
				//console.log(result);
				
				// return card result
				if(player == 1) {
					room.player1Ready = false;
					//room.Player1.send('cardResult:'+result[0].getResult()+":"+result[1].getResult()+":"+p1Card+":"+p2Card);
					var tempJson = json({
						type:"cardResult",
						yourResult:result[0],
						oppoResult:result[1],
						yourCardIndex:p1Card,
						oppoCardIndex:p2Card
						});
					room.Player1.send(tempJson);
					console.log("Player 1 result: " + tempJson);
				}
				if(player == 2) {
					room.player2Ready = false;
					//room.Player2.send('cardResult:'+result[1].getResult()+":"+result[0].getResult()+":"+p2Card+":"+p1Card);
					var tempJson = json({
						type:"cardResult",
						yourResult:result[1],
						oppoResult:result[0],
						yourCardIndex:p2Card,
						oppoCardIndex:p1Card
						});
					room.Player2.send(tempJson);
					console.log("Player 2 result: " + tempJson);
				}
				
				// update players hand
				if(!room.player1Ready && !room.player2Ready) {
					room.player1Hand[p1Card].HP = result[0].HP;
					room.player1Hand[p1Card].ATK = result[0].ATK;
					room.player1Hand[p1Card].SP = result[0].SP;
					
					room.player2Hand[p2Card].HP = result[1].HP;
					room.player2Hand[p2Card].ATK = result[1].ATK;
					room.player2Hand[p2Card].SP = result[1].SP;
				}
				
			}
			
		}
	});
	
	// leaver handling
	socket.on('disconnect', function() {
		//console.log("ASDFASDF");
		var i;
		var disName;
		var pos;
		// remove from lobby
		for(i = 0; i < lobby.length; i++) {
			if(lobby[i].socket == socket) {
				
				disName = lobby[i].username;//memberList[i];
				//memberList.splice(i,1);
				pos = i+1;
				lobby.splice(i,1);
				for(i = 0; i < lobby.length; i++) {
				//var tempVar = 'dc,' + disName + ',' + pos;
					var tempVar = json({
						type:"dc",
						disName:disName,
						pos:pos
					});
					//lobby[i].emit('message', tempVar);
					lobby[i].socket.send(tempVar);
				}
			}
		}
		
		
		// remove from match
		CloseRoom:
		for(i = 0; i < matchRoom.length; i++) {
			if(matchRoom[i].Player1 == socket || matchRoom[i].Player2 == socket) {
				
				var roomToClose = matchRoom[i];
				var tempJson = json({
					type:"backToLobby"
				});
				roomToClose.Player1.send(tempJson);
				roomToClose.Player2.send(tempJson);
				matchRoom.splice(i,1);
				break CloseRoom;
			}
		}
	});
	//socket.send('message', 'message');
});

// broadcast message
/*
function sendOutMes(username, message) {
	
	//return "NewMessage,"+username+": "+message;
	return json({
		"type":"NewMessage",
		"username":username,
		"message":message
	});
}
*/
// Player
function Player (username, id, socket) {
	this.username = username;
	this.id = id;
	this.socket = socket;
	//this.isChallenged = false;
}

// card
function Card (cardName, HP, ATK, SP, imgLink) {
	this.cardName = cardName;
	this.HP = HP;
	this.ATK = ATK;
	this.SP = SP;
	this.imgLink = imgLink;
	//this.SpecialEffect = SpecialEffect;
	
	// empty function
	this.effectBeforeAttack = function(onCard){};
	this.effectAfterAttack = function(onCard){};
	
	this.getString = function() {
		return cardName+","+HP+","+ATK+","+SP+","+imgLink;
	}
}

// card logic
function getCardResult(card1, card2) {
	var cardOneResult = {
		HP: "",
		ATK: "",
		SP: "",
		getResult: function() {
			return this.HP+","+this.ATK+","+this.SP;
		}
	}, 
	cardTwoResult = {
		HP: "",
		ATK: "",
		SP: "",
		getResult: function() {
			return this.HP+","+this.ATK+","+this.SP;
		}
	};
	
	// get cards info
	cardOneResult.HP = card1.HP;
	cardOneResult.ATK = card1.ATK;
	cardOneResult.SP = card1.SP;
	
	cardTwoResult.HP = card2.HP;
	cardTwoResult.ATK = card2.ATK;
	cardTwoResult.SP = card2.SP;
	
	// effectBeforeAttack
	// card1 effect on card2
	card1.effectBeforeAttack(cardTwoResult);
	// card 2 effect on card1
	card2.effectBeforeAttack(cardOneResult);
	
	// attack each other
	//console.log("Card1: "+cardOneResult.HP + " : " + cardTwoResult.ATK);
	cardOneResult.HP -= cardTwoResult.ATK;
	//console.log("Card2: "+cardTwoResult.HP + " : " + cardOneResult.ATK);
	cardTwoResult.HP -= cardOneResult.ATK;

	//effectAfterAttack
	// card1 effect on card2
	card1.effectAfterAttack(cardTwoResult);
	// card 2 effect on card1
	card2.effectAfterAttack(cardOneResult);
	
	// return result
	var resultOfCompare = [];
	resultOfCompare.push(cardOneResult);
	resultOfCompare.push(cardTwoResult);
	return resultOfCompare;
}

// Match
function match(RoomId, Player1, Player2) {
	
	// player1 and player2 are sockets
	this.RoomId = RoomId;
	this.Player1 = Player1;
	this.Player2 = Player2;
	this.player1Card; // int, the index of the card in player's hand
	this.player2Card; // int, the index of the card in player's hand
	this.player1Ready = false;
	this.player2Ready = false;
	this.player1Hand=[];
	this.player2Hand=[];
	
	//this.isEmpty = false;
}