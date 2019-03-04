var INTERVAL = 50;
var ROTATION_SPEED = 5;
var ARENA_MARGIN = 30;

function Game(arenaId, w, h, socket){
	this.tanks = []; //Tanks (other than the local tank)
	this.balls = [];
	this.width = w;
	this.height = h;
	this.$arena = $(arenaId);
	this.$arena.css('width', w);
	this.$arena.css('height', h);
	this.socket = socket;

	var g = this;
	setInterval(function(){
		g.mainLoop();
	}, INTERVAL);
}

Game.prototype = {
	addTank: function(id, name, type, isLocal, x, y, hp){
		var t = new Tank(id, name, type, this.$arena, this, isLocal, x, y, hp);
		if(isLocal){
			this.localTank = t;
		}else{
			this.tanks.push(t);
		}
	},
	removeTank: function(tankId){
		this.tanks = this.tanks.filter( function(t){return t.id != tankId} );
		$('#' + tankId).remove();
		$('#info-' + tankId).remove();
	},
	killTank: function(tank){
		tank.dead = true;
		this.removeTank(tank.id);
		this.$arena.append('<img id="expl' + tank.id + '" class="explosion" src="/static/img/explosion.gif">');
		$('#expl' + tank.id).css('left', (tank.x - 50)  + 'px');
		$('#expl' + tank.id).css('top', (tank.y - 100)  + 'px');
		setTimeout(function(){
			$('#expl' + tank.id).remove();
		}, 1000);
	},

	mainLoop: function(){
		if(this.localTank != undefined){
			this.sendData();
			this.localTank.move();
		}
	},

	sendData: function(){
		var gameData = {};
		var t = {
			id: this.localTank.id,
			x: this.localTank.x,
			y: this.localTank.y,
			baseAngle: this.localTank.baseAngle,
			cannonAngle: this.localTank.cannonAngle
		};
		gameData.tank = t;
		this.socket.emit('sync', gameData);

	},      

	receiveData: function(serverData){
		var game = this;

		serverData.tanks.forEach( function(serverTank){
			if(game.localTank !== undefined && serverTank.id == game.localTank.id){
				game.localTank.hp = serverTank.hp;
				if(game.localTank.hp <= 0){
					game.killTank(game.localTank);
				}
			}
			var found = false;
			game.tanks.forEach( function(clientTank){
				if(clientTank.id === serverTank.id){
					clientTank.x = serverTank.x;
					clientTank.y = serverTank.y;
					clientTank.baseAngle = serverTank.baseAngle;
					clientTank.cannonAngle = serverTank.cannonAngle;
					clientTank.hp = serverTank.hp;
					if(clientTank.hp <= 0){
						game.killTank(clientTank);
					}
					clientTank.refresh();
					found = true;
				}
			});
			if(!found &&
				(game.localTank == undefined || serverTank.id != game.localTank.id)){
				game.addTank(serverTank.id, serverTank.name, serverTank.type, false, serverTank.x, serverTank.y, serverTank.hp);
			}
		});
		game.$arena.find('.cannon-ball').remove();
		serverData.balls.forEach( function(serverBall){
			var b = new Ball(serverBall.id, serverBall.ownerId, game.$arena, serverBall.x, serverBall.y);
			b.exploding = serverBall.exploding;
			if(b.exploding){
				b.explode();
			}
		});
	}
}

function Ball(id, ownerId, $arena, x, y){
	this.id = id;
	this.ownerId = ownerId;
	this.$arena = $arena;
	this.x = x;
	this.y = y;
	this.materialize();
}

Ball.prototype = {
	materialize: function(){
		this.$arena.append('<div id="' + this.id + '" class="cannon-ball" style="left:' + this.x + 'px"></div>');
		this.$body = $('#' + this.id);
		this.$body.css('left', this.x + 'px');
		this.$body.css('top', this.y + 'px');
	},
	explode: function(){
		this.$arena.append('<div id="expl' + this.id + '" class="ball-explosion" style="left:' + this.x + 'px"></div>');
		var $expl = $('#expl' + this.id);
		$expl.css('left', this.x + 'px');
		$expl.css('top', this.y + 'px');
		setTimeout( function(){
			$expl.addClass('expand');
		}, 1);
		
		setTimeout( function(){
			$expl.remove();
		}, 1000);
	}
}

function Tank(id, name, type, $arena, game, isLocal, x, y, hp){
	this.id = id;
	this.name= name;
	this.type = type;
	this.speed = 5;
	this.$arena = $arena;
	this.w = 60;
	this.h = 80;
	this.baseAngle = getRandomInt(0, 360);
	this.baseAngle -= (this.baseAngle % ROTATION_SPEED);
	this.cannonAngle = 0;
	this.x = x;
	this.y = y;
	this.mx = null;
	this.my = null;
	this.dir = {
		up: false,
		down: false,
		left: false,
		right: false
	};
	this.game = game;
	this.isLocal = isLocal;
	this.hp = hp;
	this.dead = false;

	this.materialize();
}

Tank.prototype = {
	materialize: function(){
		this.$arena.append('<div id="' + this.id + '" class="tank tank' + this.type + '"></div>');
		this.$body = $('#' + this.id);
		this.$body.css('width', this.w);
		this.$body.css('height', this.h);

		this.$body.css('-webkit-transform', 'rotateZ(' + this.baseAngle + 'deg)');
		this.$body.css('-moz-transform', 'rotateZ(' + this.baseAngle + 'deg)');
		this.$body.css('-o-transform', 'rotateZ(' + this.baseAngle + 'deg)');
		this.$body.css('transform', 'rotateZ(' + this.baseAngle + 'deg)');

		this.$body.append('<div id="cannon-' + this.id + '" class="tank-cannon"></div>');
		this.$cannon = $('#cannon-' + this.id);

		this.$arena.append('<div id="info-' + this.id + '" class="info"></div>');
		this.$info = $('#info-' + this.id);
		this.$info.append('<div class="label">' + this.name + '</div>');
		this.$info.append('<div class="hp-bar"></div>');

		this.refresh();

		if(this.isLocal){
			this.setControls();
		}
	},

	isMoving: function(){
		return this.dir.up || this.dir.down || this.dir.left || this.dir.right;
	},

	refresh: function(){
		this.$body.css('left', this.x - 30 + 'px');
		this.$body.css('top', this.y - 40 + 'px');
		this.$body.css('-webkit-transform', 'rotateZ(' + this.baseAngle + 'deg)');
		this.$body.css('-moz-transform', 'rotateZ(' + this.baseAngle + 'deg)');
		this.$body.css('-o-transform', 'rotateZ(' + this.baseAngle + 'deg)');
		this.$body.css('transform', 'rotateZ(' + this.baseAngle + 'deg)');

		var cannonAbsAngle = this.cannonAngle - this.baseAngle;
		this.$cannon.css('-webkit-transform', 'rotateZ(' + cannonAbsAngle + 'deg)');
		this.$cannon.css('-moz-transform', 'rotateZ(' + cannonAbsAngle + 'deg)');
		this.$cannon.css('-o-transform', 'rotateZ(' + cannonAbsAngle + 'deg)');
		this.$cannon.css('transform', 'rotateZ(' + cannonAbsAngle + 'deg)');

		this.$info.css('left', (this.x) + 'px');
		this.$info.css('top', (this.y) + 'px');
		if(this.isMoving()){
			this.$info.addClass('fade');
		}else{
			this.$info.removeClass('fade');
		}

		this.$info.find('.hp-bar').css('width', this.hp + 'px');
	},

	setControls: function(){
		var t = this;

		$(document).keypress( function(e){
			var k = e.keyCode || e.which;
			switch(k){
				case 119: 
					t.dir.up = true;
					break;
				case 100: 
					t.dir.right = true;
					break;
				case 115: 
					t.dir.down = true;
					break;
				case 97: 
					t.dir.left = true;
					break;
			}

		}).keyup( function(e){
			var k = e.keyCode || e.which;
			switch(k){
				case 87: 
					t.dir.up = false;
					break;
				case 68: 
					t.dir.right = false;
					break;
				case 83: 
					t.dir.down = false;
					break;
				case 65: 
					t.dir.left = false;
					break;
			}
		}).mousemove( function(e){ 
			t.mx = e.pageX - t.$arena.offset().left;
			t.my = e.pageY - t.$arena.offset().top;
			t.setCannonAngle();
		}).click( function(){
			t.shoot();
		});

	},

	move: function(){
		if(this.dead){
			return;
		}

		var moveX = 0;
		var moveY = 0;

		if (this.dir.up) {
			moveY = -1;
		} else if (this.dir.down) {
			moveY = 1;
		}
		if (this.dir.left) {
			moveX = -1;
		} else if (this.dir.right) {
			moveX = 1;
		}

		moveX = this.speed * moveX;
		moveY = this.speed * moveY;

		if(this.x + moveX > (0 + ARENA_MARGIN) && (this.x + moveX) < (this.$arena.width() - ARENA_MARGIN)){
			this.x += moveX;
		}
		if(this.y + moveY > (0 + ARENA_MARGIN) && (this.y + moveY) < (this.$arena.height() - ARENA_MARGIN)){
			this.y += moveY;
		}
		this.rotateBase();
		this.setCannonAngle();
		this.refresh();
	},

	rotateBase: function(){
		if((this.dir.up && this.dir.left)
			|| (this.dir.down && this.dir.right)){ 
			this.setDiagonalLeft();
		}else if((this.dir.up && this.dir.right)
			|| (this.dir.down && this.dir.left)){ 
			this.setDiagonalRight();
		}else if(this.dir.up || this.dir.down){
			this.setVertical();
		}else if(this.dir.left || this.dir.right){  
			this.setHorizontal();
		}

	},

	setVertical: function(){
		var a = this.baseAngle;
		if(a != 0 && a != 180){
			if(a < 90 || (a > 180 && a < 270)){
				this.decreaseBaseRotation();
			}else{
				this.increaseBaseRotation();
			}
		}
	},

	setHorizontal: function(){
		var a = this.baseAngle;
		if(a != 90 && a != 270){
			if(a < 90 || (a > 180 && a < 270)){
				this.increaseBaseRotation();
			}else{
				this.decreaseBaseRotation();
			}
		}
	},

	setDiagonalLeft: function(){
		var a = this.baseAngle;
		if(a != 135 && a != 315){
			if(a < 135 || (a > 225 && a < 315)){
				this.increaseBaseRotation();
			}else{
				this.decreaseBaseRotation();
			}
		}
	},

	setDiagonalRight: function(){
		var a = this.baseAngle;
		if(a != 45 && a != 225){
			if(a < 45 || (a > 135 && a < 225)){
				this.increaseBaseRotation();
			}else{
				this.decreaseBaseRotation();
			}
		}
	},

	increaseBaseRotation: function(){
		this.baseAngle += ROTATION_SPEED;
		if(this.baseAngle >= 360){
			this.baseAngle = 0;
		}
	},

	decreaseBaseRotation: function(){
		this.baseAngle -= ROTATION_SPEED;
		if(this.baseAngle < 0){
			this.baseAngle = 0;
		}
	},

	setCannonAngle: function(){
		var tank = { x: this.x , y: this.y};
		var deltaX = this.mx - tank.x;
		var deltaY = this.my - tank.y;
		this.cannonAngle = Math.atan2(deltaY, deltaX) * 180 / Math.PI;
		this.cannonAngle += 90;
	},

	shoot: function(){
		if(this.dead){
			return;
		}
		var serverBall = {};
		serverBall.alpha = this.cannonAngle * Math.PI / 180;
		var cannonLength = 60;
		var deltaX = cannonLength * Math.sin(serverBall.alpha);
		var deltaY = cannonLength * Math.cos(serverBall.alpha);

		serverBall.ownerId = this.id;
		serverBall.x = this.x + deltaX - 5;
		serverBall.y = this.y - deltaY - 5;

		this.game.socket.emit('shoot', serverBall);
	}

}

function getRandomInt(min, max) {
	return Math.floor(Math.random() * (max - min)) + min;
}

