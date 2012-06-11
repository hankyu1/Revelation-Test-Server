/**
 * @author Hank
 */


//var memberList = [];
var app = require('http').createServer();
var io = require('socket.io').listen(app, {origins: '*:*'});
var port = process.env.PORT || 5000;
app.listen(port);
//var userName = "";
var lobby = [];
var matchRoom = [];
var json = JSON.stringify;
console.log(port);

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
mongo.model('loginInfo', new Schema({username:{type:String, index:true},
			     	     password:String},
			     	     {collection:'users'}));
									
// use this one for	getting currency, exp, and avatar img
mongo.model('infoDisplay', new Schema({username:{type:String,index:true},
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
// card
var card = new Schema({
			cardID:String,
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
			note:String,
			exp:Number,
			level:Number,
			unspendedCP:Number
});

// use this one for getting hands
mongo.model('handInfo', new Schema({username:{type:String,index:true},
				    cards:[card]},
			           {collection:'hands'}));

// use this one for getting player's collection (collection is a reserve word so use collect instead)
mongo.model('collectInfo', new Schema({username:{type:String,index:true},
				       cards:[card]},
				      {collection:'collect'}));

// monster cards
mongo.model('monster_cards', new Schema({cardID:{type:String,index:true},
					 name:String,
					 hp:Number,
					 ap:Number,
					 cp:Number,
					 sp:Number,
					 unspendedCP:Number,
					 ability:Number,
					 affiliation:String,
					 opposition:String,
					 image:String,
					 description:String,
					 notes:String},
			   		{collection:'monster_cards'}));
			   		
// function table
var functionTable = {};

// general functions
// check login
functionTable["loginString"] = function(inputMessage, socket){
	var username = inputMessage.username;
	var password = inputMessage.password;
	
	var loginInfo = mongo.model('loginInfo');
	loginInfo.find({'username':username},['username','password'],function(err,data){
		var isOnline = false;
		
		if(data.length >0) {
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
				else {
					socket.send(json({login:"false"}));
				}
			}
		}
		else {
			socket.send(json({login:"false"}));
		}
	});
}

// get avatar information
functionTable['getAvatarInfo'] = function(inputMessage, socket){
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

// send message
functionTable['sendMes'] = function(inputMessage, socket) {
	var username = inputMessage.username;
	var message = inputMessage.message;
	var brodcastMes = json({
		type:"NewMessage",
		username:username,
		message:message
	});
	for(var i = 0; i < lobby.length; i++) {
		lobby[i].socket.send(brodcastMes);
	}
}

// get memberList
functionTable['getList'] = function(inputMessage, socket) {
	var memberList = [];
	for(var i = 0; i < lobby.length; i++) {
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

// challenge message
functionTable['Challenge'] = function(inputMessage, socket) {
	var Player1 = inputMessage.challenger;
	var Player2 = inputMessage.receiver;
	
	findUser:
	for(var i = 0; i < lobby.length; i++) {
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
functionTable['challengeDenied'] = function(inputMessage, socket) {
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
functionTable['challengeAccept'] = function(inputMessage, socket) {
	var receiver = inputMessage.receiver;
	var challenger = inputMessage.challenger;
	
	// get socket of 2 players
	var player1Socket, player2Socket;
	var find1 = false, find2 = false;
	
	// find players
	finishSocketFinding:
	for(var i = 0; i < lobby.length; i++) {
		if(find1 & find2)
			break finishSocketFinding;
		else {
			if(lobby[i].username == receiver) {
				player1Socket = lobby[i].socket;
				find1 = true;
			}
			else if(lobby[i].username == challenger) {
				player2Socket = lobby[i].socket;
				find2 = true;
			}
		}
	}
	
	var roomIndex = matchRoom.length;
	console.log("Get RoomIndex:", roomIndex);
	matchRoom.push(new match(roomIndex, player1Socket, player2Socket));
	console.log("Joined in room:", matchRoom[roomIndex].RoomId);
	// enter room
	var startDualJson = json({
		type:"startDual",
		roomIndex:roomIndex
	});
	player1Socket.send(startDualJson);
	player2Socket.send(startDualJson);
}

// battle page
// root
var battleCallTable = {};
functionTable['matchRoom'] = function(inputMessage, socket) {
	var room, player, username;
	
	room = matchRoom[inputMessage.roomId];	
	
	//console.log("find room:", room, room.roomId);
	battleCallTable[inputMessage.call](inputMessage, room, socket);
}

battleCallTable['cardInitialSetup'] = function(inputMessage, room, player) {
	
	var handInfo = mongo.model('handInfo');
	var username = inputMessage.username;
	handInfo.find({username:username},['cards'],function(err, hand) {
		if(!err) {
			
			// push to room
			/*
			this.cardName = cardName;
			this.HP = HP;
			this.ATK = ATK;
			this.SP = SP;
			this.imgLink = imgLink;
			*/
			
			if(room.Player1 == player) {
				for(var i = 0; i < 5; i++) {
					room.player1Hand.push(new Card(hand[0].cards[i].name, hand[0].cards[i].hp, hand[0].cards[i].ap, hand[0].cards[i].sp, hand[0].cards[i].image));
				}
			}
			if(room.Player2 == player) {
				for(var i = 0; i < 5; i++) {
					room.player2Hand.push(new Card(hand[0].cards[i].name, hand[0].cards[i].hp, hand[0].cards[i].ap, hand[0].cards[i].sp, hand[0].cards[i].image));
				}
			}
			
			// message
			var tempJson = json({
				type:"cardInitialSetup",
				cards:hand[0].cards
			});
			//console.log("cards:", hand[0].cards);
			player.send(tempJson);
		}
	});
}

battleCallTable['cardReady'] = function(inputMessage, room, player) {
	if(room.Player1 == player) {
		room.player1Card = inputMessage.cardIndex;
		room.player1Ready = true;
	}
	if(room.Player2 == player) {
		room.player2Card = inputMessage.cardIndex;
		room.player2Ready = true;
	}
	
	if(room.player1Ready && room.player2Ready) {
		
		console.log("both players are ready!");
		// send enemy card information to each player
		room.player1Ready = false;
		room.player2Ready = false;
		room.Player1.send(
			json({
				type:"enemyCardInfo",
				cardIndex:room.player2Card,
				info:room.player2Hand[room.player2Card]
			})
		);
		//console.log("player1Info", room.player2Hand[room.player2Card], room.player2Card, room.Player2Hand);
		room.Player2.send(
			json({
				type:"enemyCardInfo",
				cardIndex:room.player1Card,
				info:room.player1Hand[room.player1Card]
			})
		);
		
		// set card result
		getCardResult(room.player1Hand[room.player1Card], room.player2Hand[room.player2Card]);
		
		//console.log("cardResult: ", result);
		
		console.log("after battle");
		console.log("card1:", room.player1Hand[room.player1Card]);
		console.log("card2:", room.player2Hand[room.player2Card]);
		
		// update players hand
		/*
		room.player1Hand[room.player1Card].HP = result[0].HP;
		room.player1Hand[room.player1Card].ATK = result[0].ATK;
		room.player1Hand[room.player1Card].SP = result[0].SP;
	
		room.player2Hand[room.player2Card].HP = result[1].HP;
		room.player2Hand[room.player2Card].ATK = result[1].ATK;
		room.player2Hand[room.player2Card].SP = result[1].SP;
		*/
	}
}

battleCallTable['cardResult'] = function(inputMessage, room, player) {

	//console.log("????????");

	if(player == room.Player1) {
		player.send(
			json({
				type:"cardResult",
				yourCard:room.player1Hand[room.player1Card],
				oppoCard:room.player2Hand[room.player2Card],
				yourIndex:room.player1Card,
				oppoIndex:room.player2Card
			})
		);
		//console.log("from P1","Yourcard:", player1Card)
	}
	if(player == room.Player2){
		player.send(
			json({
				type:"cardResult",
				yourCard:room.player2Hand[room.player2Card],
				oppoCard:room.player1Hand[room.player1Card],
				yourIndex:room.player2Card,
				oppoIndex:room.player1Card
			})
		);
	}

	
}

battleCallTable['winner'] = function(inputMessage, room, player) {

	console.log("Game Finished");

	// identify player
	// player 1 is the winner
	if(room.Player1 == player) {
		var tempJson = json({
			type:"gameFinished",
			mes:"You Win!"
		});
		room.Player1.send(tempJson);
		tempJson = json({
			type:"gameFinished",
			mes:"You Lose!"
		});
		room.Player2.send(tempJson);
	}
	// player 2 is the winner
	else {
		var tempJson = json({
			type:"gameFinished",
			mes:"You Lose!"
		});
		room.Player1.send(tempJson);
		tempJson = json({
			type:"gameFinished",
			mes:"You Win!"
		});
		room.Player2.send(tempJson);
	}
}

battleCallTable['tie'] = function(inputMessage, room, player) {
	var tempJson = json({
		type:"gameFinished",
		mes:"It's a Tie!"
	});
	
	room.Player1.send(tempJson);
	room.Player2.send(tempJson);
}

// collection page
var CollectionCallTable = {};
functionTable['collection'] = function(inputMessage, socket) {
	var userName = inputMessage.username;
	
	CollectionCallTable[inputMessage.call](inputMessage, userName, socket);
}

// get player's colleciton/hand
CollectionCallTable['getAllCard'] = function(inputMessage, userName, socket) {
	var collectInfo = mongo.model('collectInfo');
	var handInfo = mongo.model('handInfo');
	collectInfo.find({username:userName},['cards'],function(err, collectionCard) {
		//console.log("collectInfo", data.length);
		handInfo.find({username:userName},['cards'],function(err, handCard) {
			var CollectionNames = [];
			var HandNames = [];
			
			var cCard = collectionCard[0].cards;
			var hCard = handCard[0].cards
			
			console.log("cCard", cCard[0].name);
			console.log("hCard", hCard[0].name);
			
			for(var i = 0; i < cCard.length; i++) {
				CollectionNames.push(cCard[i].name);
			}
			for(var i = 0; i < hCard.length; i++) {
				HandNames.push(hCard[i].name);
			}
			
			var tempJson = json({
				type:"cardList",
				Collection:CollectionNames,
				Hand:HandNames,
				collectNum:CollectionNames.length,
				handNum:HandNames.length
			});
			socket.send(tempJson);
		});
		
	});
}

// select Collection Card
CollectionCallTable['selectCollectionCard'] = function(inputMessage, userName, socket) {
	var cardIndex = inputMessage.cardIndex;
	var collectInfo = mongo.model('collectInfo');	
	collectInfo.find({username:userName},['cards'],function(err, data) {
		var data = data[0].cards;
		
		var tempJson = json({
			type:"cardInfo",
			selectedCardInfo:data[cardIndex]
		});

		console.log(tempJson);
		//console.log(cardNames, cardNames.length);
		socket.send(tempJson);
	});
}

// select Hand Card
CollectionCallTable['selectHandCard'] = function(inputMessage, userName, socket) {
	var handInfo = mongo.model('handInfo');
	handInfo.find({username:userName},['cards'],function(err, data) {
		//console.log("collectInfo", data.length);
		//console.log("indexTexting:",data[0].cards[0]);
		var data = data[0].cards;
		
		var tempJson = json({
			type:"cardInfo",
			selectedCardInfo:data[inputMessage.cardIndex]
		});

		console.log(tempJson);
		//console.log(cardNames, cardNames.length);
		socket.send(tempJson);
	});
}

// insert a card from hand set to collection set
CollectionCallTable['insertToCollection'] = function(inputMessage, userName, socket) {
	var cardIndex = inputMessage.cardIndex;
	var collectInfo = mongo.model('collectInfo');
	var handInfo = mongo.model('handInfo');
	
	// copy and remove from hand
	handInfo.find({username:userName},['cards'],function(err, data) {
		// copy object (card)
		var cardToInsert = data[0].cards[cardIndex];					
		
		// remove from hand
		//handInfo.update({username:userName},{'$unset':{'cards':cardIndex}},function(){});
		
		data[0].cards[cardIndex].remove();
		data[0].save();
		
		// insert to collection
		collectInfo.find({username:userName},['cards'],function(err, data) {
			data[0].cards.push(cardToInsert);
			data[0].save(function(err){});
		});
	});
}

// insert a card from collection set to hand set
CollectionCallTable['insertToHand'] = function(inputMessage, userName, socket) {
	var cardIndex = inputMessage.cardIndex;
	var collectInfo = mongo.model('collectInfo');
	var handInfo = mongo.model('handInfo');
	
	// copy and remove from hand
	collectInfo.find({username:userName},['cards'],function(err, data) {
		// copy object (card)
		var cardToInsert = data[0].cards[cardIndex];					
		
		// remove from collection
		data[0].cards[cardIndex].remove();
		data[0].save();
		
		/*
		var tempCollect = data[0].cards;
		tempCollect.splice(cardIndex-1,1);
		collectInfo.update({username:userName},{upsert: true},{'$set':{'cards':tempHand}});
		data[0].save(function(err){});
		*/
		
		// insert to collection
		handInfo.find({username:userName},['cards'],function(err, data) {
			data[0].cards.push(cardToInsert);
			data[0].save(function(err){});
		});
	});
}

// level up a card
CollectionCallTable['levelUp'] = function(inputMessage, userName, socket) {
	var cardIndex = inputMessage.cardIndex;
	var from = inputMessage.from;
	var userInfo = mongo.model('infoDisplay');
	
	if(from == "hand") {
		var cardInfo = mongo.model('handInfo');
		cardInfo.find({username:userName},['cards'],function(err, card) {
			userInfo.find({username:userName},['exp'],function(err, user) {
				// if enough exp
				console.log("userInfoFormat: ", user[0]);
				if(user[0].exp >= card[0].cards[cardIndex].exp && card[0].cards[cardIndex].level < 3) {
					card[0].cards[cardIndex].level++;
					card[0].cards[cardIndex].unspendedCP += 5;
					user[0].exp -= card[0].cards[cardIndex].exp;
					card[0].cards[cardIndex].exp += 200;
					card[0].save(function(err){});
					user[0].save(function(err){});
					var cardInfo = card[0].cards[cardIndex];
					var tempJson = json({
						type:"levelupRefresh",
						cardInfo:cardInfo,
						userExp:user[0].exp
					});
					socket.send(tempJson);
				}
				// if reach max level
				else if(card[0].cards[cardIndex].level >= 3) {
					var tempJson = json({
						type:"reachMaxLevel"
					});
					socket.send(tempJson);
				}
				// if not enought exp
				else if(user[0].exp >= card[0].cards[cardIndex].exp){
					var tempJson = json({
						type:"notEnoughExp"
					});
					socket.send(tempJson);
				}
				
			});
		});
	}
	else if(from == "collection") {
		var cardInfo = mongo.model('collectInfo');
		cardInfo.find({username:userName},['cards'],function(err, card) {
			userInfo.find({username:userName},['exp'],function(err, user) {
				// if enough exp
				if(user[0].exp >= card[0].cards[cardIndex].exp && card[0].cards[cardIndex].level < 3) {
					console.log("cardLv: ", card[0].cards[cardIndex].level);
					card[0].cards[cardIndex].level++;
					card[0].cards[cardIndex].unspendedCP += 5;
					user[0].exp -= card[0].cards[cardIndex].exp;
					card[0].cards[cardIndex].exp += 200;
					card[0].save(function(err){});
					user[0].save(function(err){});
					var cardInfo = card[0].cards[cardIndex];
					var tempJson = json({
						type:"levelupRefresh",
						cardInfo:cardInfo,
						userExp:user[0].exp
					});
					socket.send(tempJson);
				}
				// if reach max level
				else if(card[0].cards[cardIndex].level >= 3) {
					var tempJson = json({
						type:"reachMaxLevel"
					});
					socket.send(tempJson);
				}
				// if not enought exp
				else if(user[0].exp >= card[0].cards[cardIndex].exp) {
					var tempJson = json({
						type:"notEnoughExp"
					});
					socket.send(tempJson);
				}
				
			});
		});
	}
}

// add attribute on a card
CollectionCallTable['addAttribute'] = function(inputMessage, userName, socket) {
	var cardIndex = inputMessage.cardIndex;
	var from = inputMessage.from;
	
	// 58 = HitPoint, 59 = attack point, 60 = soul point, 61 = special effect
	var attribute = inputMessage.attribute;
	
	// temp variabl
	var userExp, cardInfo;
	
	console.log("attribute: ", attribute);
	if(from == "hand") {
		console.log("get level up from hand");
		var handInfo = mongo.model('handInfo');
		handInfo.find({username:userName},['cards'],function(err,data) {
			if(attribute == 0) {
				data[0].cards[cardIndex].hp += 20;
				data[0].save(function(err){});
			}
			else if(attribute == 1) {
				data[0].cards[cardIndex].ap += 5;
				data[0].save(function(err){});
			}
			else if(attribute == 2) {
				data[0].cards[cardIndex].sp += 1;
				data[0].save(function(err){});
			}
			else if(attribute == 3) {
				// not yet ready for test
			}
			
			//data[0].cards[cardIndex].level++;
			data[0].cards[cardIndex].cp+=1;
			data[0].cards[cardIndex].unspendedCP-=1;
			cardInfo = data[0].cards[cardIndex];
			data[0].save(function(err){});
			
			var tempJson = json({
					type:"attributeRefresh",
					cardInfo:cardInfo
				});
			socket.send(tempJson);
		});
		
		
	}
	else if(from == "collection") {
		console.log("get level up from hand");
		var collectInfo = mongo.model('collectInfo');
		collectInfo.find({username:userName},['cards'],function(err,data) {
			if(attribute == 0) {
				data[0].cards[cardIndex].hp += 20;
				data[0].save(function(err){});
			}
			else if(attribute == 1) {
				data[0].cards[cardIndex].ap += 5;
				data[0].save(function(err){});
			}
			else if(attribute == 2) {
				data[0].cards[cardIndex].sp += 1;
				data[0].save(function(err){});
			}
			else if(attribute == 3) {
				// not yet ready for test
			}
			
			//data[0].cards[cardIndex].level++;
			data[0].cards[cardIndex].cp+=1;
			data[0].cards[cardIndex].unspendedCP-=1;
			cardInfo = data[0].cards[cardIndex];
			data[0].save(function(err){});
			
			var tempJson = json({
				type:"attributeRefresh",
				cardInfo:cardInfo
			});
			socket.send(tempJson);
		});
	}
}

//server function
io.sockets.on('connection', function(socket) {
	//socket.emit('message', "Face");
	console.log("Connected...");
	socket.on('message', function(message) {
		console.log("Message in:" + message.toString());
		//console.log("ASDFASDF");
		var inputMessage = JSON.parse(message);//message.split(",");
		
		// run functions
		functionTable[inputMessage.type](inputMessage, socket);

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
	// effectBeforeAttack
	// card1 effect on card2
	card1.effectBeforeAttack(card2);
	// card 2 effect on card1
	card2.effectBeforeAttack(card1);
	
	// attack each other
	//console.log("Card1: "+cardOneResult.HP + " : " + cardTwoResult.ATK);
	card1.HP -= card2.ATK;
	//console.log("Card2: "+cardTwoResult.HP + " : " + cardOneResult.ATK);
	card2.HP -= card1.ATK;

	//effectAfterAttack
	// card1 effect on card2
	card1.effectAfterAttack(card2);
	// card 2 effect on card1
	card2.effectAfterAttack(card1);
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
