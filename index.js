;(function () {
	'use strict'

	// Configuration
	var COLS = 40
	var ROWS = 24
	var MIN_ROOMS = 5
	var MAX_ROOMS = 10
	var ROOM_MIN_SIZE = 3
	var ROOM_MAX_SIZE = 8
	var HALLS_PER_AXIS_MIN = 3
	var HALLS_PER_AXIS_MAX = 5
	var NUM_ENEMIES = 10
	var NUM_POTIONS = 10
	var NUM_SWORDS = 2
	var MAX_PLAYER_HP = 100
	var MAX_ENEMY_HP = 40
	var PLAYER_BASE_ATK = 10
	var SWORD_ATK_BONUS = 10

	// Tile kinds
	var TILE_WALL = 'W'
	var TILE_EMPTY = '-'
	var TILE_PLAYER = 'P'
	var TILE_ENEMY = 'E'
	var TILE_POTION = 'HP'
	var TILE_SWORD = 'SW'

	function rnd(min, max) {
		return Math.floor(Math.random() * (max - min + 1)) + min
	}

	function clamp(value, min, max) {
		return Math.max(min, Math.min(max, value))
	}

	function Game() {
		this.fieldEl = null
		this.grid = []
		this.entities = {
			player: null,
			enemies: [],
		}
		this.tileSize = 24
	}

	Game.prototype.computeTileSize = function () {
		var border = 4
		var parent = this.fieldEl.parentElement
		var top = parent.getBoundingClientRect().top || 0
		var widthAvail = Math.max(0, window.innerWidth - border)
		var heightAvail = Math.max(0, window.innerHeight - top - border)

		var size = Math.floor(heightAvail / ROWS)
		if (size < 16) size = 16
		this.tileSize = size

		var logicalWidth = COLS * this.tileSize
		var logicalHeight = ROWS * this.tileSize
		var scaleX = logicalWidth ? widthAvail / logicalWidth : 1
		if (!isFinite(scaleX) || scaleX <= 0) scaleX = 1

		this.fieldEl.style.width = logicalWidth + 'px'
		this.fieldEl.style.height = logicalHeight + 'px'
		this.fieldEl.style.transformOrigin = 'top left'
		this.fieldEl.style.transform = 'scale(' + scaleX + ', 1)'

		parent.style.width = widthAvail + 'px'
		parent.style.height = heightAvail + 'px'
	}

	Game.prototype.init = function () {
		this.fieldEl = document.querySelector('.field')
		if (!this.fieldEl) {
			throw new Error('Missing .field element')
		}

		this.computeTileSize()

		this.generateMap()
		this.placePickups()
		this.placePlayer()
		this.placeEnemies()
		this.render()
		this.bindControls()
		var self = this
		window.addEventListener('resize', function () {
			self.computeTileSize()
			self.render()
		})
	}

	Game.prototype.generateEmptyGrid = function () {
		this.grid = new Array(ROWS)
		for (var y = 0; y < ROWS; y++) {
			this.grid[y] = new Array(COLS)
			for (var x = 0; x < COLS; x++) {
				this.grid[y][x] = TILE_WALL
			}
		}
	}

	Game.prototype.carveRoom = function (x, y, w, h) {
		for (var yy = y; yy < y + h && yy < ROWS; yy++) {
			for (var xx = x; xx < x + w && xx < COLS; xx++) {
				this.grid[yy][xx] = TILE_EMPTY
			}
		}
	}

	Game.prototype.carveCorridorH = function (x1, x2, y) {
		var from = Math.min(x1, x2)
		var to = Math.max(x1, x2)
		for (var x = from; x <= to; x++) {
			if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
				this.grid[y][x] = TILE_EMPTY
			}
		}
	}

	Game.prototype.carveCorridorV = function (y1, y2, x) {
		var from = Math.min(y1, y2)
		var to = Math.max(y1, y2)
		for (var y = from; y <= to; y++) {
			if (y >= 0 && y < ROWS && x >= 0 && x < COLS) {
				this.grid[y][x] = TILE_EMPTY
			}
		}
	}

	Game.prototype.generateMap = function () {
		this.generateEmptyGrid()

		// Rooms
		var roomCount = rnd(MIN_ROOMS, MAX_ROOMS)
		var roomCenters = []
		for (var i = 0; i < roomCount; i++) {
			var w = rnd(ROOM_MIN_SIZE, ROOM_MAX_SIZE)
			var h = rnd(ROOM_MIN_SIZE, ROOM_MAX_SIZE)
			var x = rnd(1, COLS - w - 2)
			var y = rnd(1, ROWS - h - 2)
			this.carveRoom(x, y, w, h)
			roomCenters.push({ x: Math.floor(x + w / 2), y: Math.floor(y + h / 2) })
		}

		// Connect rooms to ensure reachability (MST-like chain)
		roomCenters.sort(function (a, b) {
			return a.x - b.x
		})
		for (var r = 1; r < roomCenters.length; r++) {
			var a = roomCenters[r - 1]
			var b = roomCenters[r]
			this.carveCorridorH(a.x, b.x, a.y)
			this.carveCorridorV(a.y, b.y, b.x)
		}

		// Additional random corridors
		var hv = rnd(HALLS_PER_AXIS_MIN, HALLS_PER_AXIS_MAX)
		for (var h = 0; h < hv; h++) {
			var yLine = rnd(1, ROWS - 2)
			this.carveCorridorH(1, COLS - 2, yLine)
		}
		var vv = rnd(HALLS_PER_AXIS_MIN, HALLS_PER_AXIS_MAX)
		for (var v = 0; v < vv; v++) {
			var xLine = rnd(1, COLS - 2)
			this.carveCorridorV(1, ROWS - 2, xLine)
		}
	}

	Game.prototype.randomEmptyCell = function () {
		for (var attempts = 0; attempts < 1000; attempts++) {
			var x = rnd(1, COLS - 2)
			var y = rnd(1, ROWS - 2)
			if (this.grid[y][x] === TILE_EMPTY) {
				return { x: x, y: y }
			}
		}
		return null
	}

	Game.prototype.placePickups = function () {
		for (var i = 0; i < NUM_POTIONS; i++) {
			var c = this.randomEmptyCell()
			if (c) {
				this.grid[c.y][c.x] = TILE_POTION
			}
		}
		for (var s = 0; s < NUM_SWORDS; s++) {
			var cs = this.randomEmptyCell()
			if (cs) {
				this.grid[cs.y][cs.x] = TILE_SWORD
			}
		}
	}

	Game.prototype.placePlayer = function () {
		var c = this.randomEmptyCell()
		if (!c) {
			c = { x: 1, y: 1 }
		}
		this.entities.player = {
			x: c.x,
			y: c.y,
			hp: MAX_PLAYER_HP,
			maxHp: MAX_PLAYER_HP,
			atk: PLAYER_BASE_ATK,
		}
		this.grid[c.y][c.x] = TILE_PLAYER
	}

	Game.prototype.placeEnemies = function () {
		this.entities.enemies = []
		for (var i = 0; i < NUM_ENEMIES; i++) {
			var c = this.randomEmptyCell()
			if (!c) {
				continue
			}
			var enemy = {
				x: c.x,
				y: c.y,
				hp: MAX_ENEMY_HP,
				maxHp: MAX_ENEMY_HP,
				atk: 8,
				id: 'e' + i,
			}
			this.entities.enemies.push(enemy)
			this.grid[c.y][c.x] = TILE_ENEMY
		}
	}

	Game.prototype.isInside = function (x, y) {
		return x >= 0 && x < COLS && y >= 0 && y < ROWS
	}

	Game.prototype.canWalk = function (x, y) {
		if (!this.isInside(x, y)) return false
		var t = this.grid[y][x]
		return t === TILE_EMPTY || t === TILE_POTION || t === TILE_SWORD
	}

	Game.prototype.tryMovePlayer = function (dx, dy) {
		var p = this.entities.player
		var nx = clamp(p.x + dx, 0, COLS - 1)
		var ny = clamp(p.y + dy, 0, ROWS - 1)
		if (nx === p.x && ny === p.y) return false
		var target = this.grid[ny][nx]
		if (target === TILE_ENEMY) {
			return false
		}
		if (this.canWalk(nx, ny)) {
			if (target === TILE_POTION) {
				p.hp = clamp(p.hp + 30, 0, p.maxHp)
			} else if (target === TILE_SWORD) {
				p.atk += SWORD_ATK_BONUS
			}
			this.grid[p.y][p.x] = TILE_EMPTY
			p.x = nx
			p.y = ny
			this.grid[p.y][p.x] = TILE_PLAYER
			return true
		}
		return false
	}

	Game.prototype.playerAttack = function () {
		var p = this.entities.player
		var deltas = [
			{ x: 1, y: 0 },
			{ x: -1, y: 0 },
			{ x: 0, y: 1 },
			{ x: 0, y: -1 },
		]
		var any = false
		for (var i = 0; i < deltas.length; i++) {
			var nx = p.x + deltas[i].x
			var ny = p.y + deltas[i].y
			if (!this.isInside(nx, ny)) continue
			if (this.grid[ny][nx] === TILE_ENEMY) {
				var enemy = this.findEnemyAt(nx, ny)
				if (enemy) {
					enemy.hp -= p.atk
					if (enemy.hp <= 0) {
						this.removeEnemy(enemy)
					}
					any = true
				}
			}
		}
		return any
	}

	Game.prototype.findEnemyAt = function (x, y) {
		for (var i = 0; i < this.entities.enemies.length; i++) {
			var e = this.entities.enemies[i]
			if (e.x === x && e.y === y) return e
		}
		return null
	}

	Game.prototype.removeEnemy = function (enemy) {
		this.grid[enemy.y][enemy.x] = TILE_EMPTY
		for (var i = 0; i < this.entities.enemies.length; i++) {
			if (this.entities.enemies[i] === enemy) {
				this.entities.enemies.splice(i, 1)
				break
			}
		}
	}

	Game.prototype.enemyTurn = function () {
		var p = this.entities.player
		for (var i = 0; i < this.entities.enemies.length; i++) {
			var e = this.entities.enemies[i]
			var dx = p.x - e.x
			var dy = p.y - e.y
			var dist = Math.abs(dx) + Math.abs(dy)
			if (dist === 1) {
				// attack
				p.hp -= e.atk
				p.hp = Math.max(0, p.hp)
				if (p.hp <= 0) {
					alert('Вы погибли! Перезагрузите страницу для новой игры.')
				}
				continue
			}
			var dirs = [
				{ x: 1, y: 0 },
				{ x: -1, y: 0 },
				{ x: 0, y: 1 },
				{ x: 0, y: -1 },
			]
			var order = rnd(0, 3)
			var tryDirs = [
				dirs[order],
				dirs[(order + 1) % 4],
				dirs[(order + 2) % 4],
				dirs[(order + 3) % 4],
			]
			for (var d = 0; d < tryDirs.length; d++) {
				var nx = e.x + tryDirs[d].x
				var ny = e.y + tryDirs[d].y
				if (!this.isInside(nx, ny)) continue
				var t = this.grid[ny][nx]
				if (t === TILE_EMPTY || t === TILE_POTION || t === TILE_SWORD) {
					this.grid[e.y][e.x] =
						this.grid[e.y][e.x] === TILE_ENEMY
							? TILE_EMPTY
							: this.grid[e.y][e.x]
					this.grid[e.y][e.x] = TILE_EMPTY
					e.x = nx
					e.y = ny
					this.grid[e.y][e.x] = TILE_ENEMY
					break
				}
			}
		}
	}

	Game.prototype.bindControls = function () {
		var self = this
		document.addEventListener('keydown', function (ev) {
			var moved = false
			switch (ev.code || ev.key) {
				case 'KeyA':
				case 'ArrowLeft':
					moved = self.tryMovePlayer(-1, 0)
					break
				case 'KeyD':
				case 'ArrowRight':
					moved = self.tryMovePlayer(1, 0)
					break
				case 'KeyW':
				case 'ArrowUp':
					moved = self.tryMovePlayer(0, -1)
					break
				case 'KeyS':
				case 'ArrowDown':
					moved = self.tryMovePlayer(0, 1)
					break
				case 'Space':
				case ' ':
					if (self.playerAttack()) {
						self.enemyTurn()
						self.render()
					}
					return
				default:
					return
			}
			if (moved) {
				self.enemyTurn()
				self.render()
			}
		})
	}

	Game.prototype.render = function () {
		while (this.fieldEl.firstChild) {
			this.fieldEl.removeChild(this.fieldEl.firstChild)
		}
		for (var y = 0; y < ROWS; y++) {
			for (var x = 0; x < COLS; x++) {
				var tile = this.grid[y][x]
				if (tile === TILE_WALL) {
					this.appendTile(x, y, 'tile tileW')
				} else if (tile === TILE_EMPTY) {
					this.appendTile(x, y, 'tile')
				} else if (tile === TILE_PLAYER) {
					var el = this.appendTile(x, y, 'tile tileP')
					this.appendHealth(
						el,
						this.entities.player.hp,
						this.entities.player.maxHp,
						true
					)
				} else if (tile === TILE_ENEMY) {
					var e = this.findEnemyAt(x, y)
					var elE = this.appendTile(x, y, 'tile tileE')
					if (e) {
						this.appendHealth(elE, e.hp, e.maxHp, false)
					}
				} else if (tile === TILE_POTION) {
					this.appendTile(x, y, 'tile tileHP')
				} else if (tile === TILE_SWORD) {
					this.appendTile(x, y, 'tile tileSW')
				}
			}
		}
	}

	Game.prototype.appendTile = function (x, y, cls) {
		var div = document.createElement('div')
		div.className = cls
		div.style.left = x * this.tileSize + 'px'
		div.style.top = y * this.tileSize + 'px'
		div.style.width = this.tileSize + 'px'
		div.style.height = this.tileSize + 'px'
		this.fieldEl.appendChild(div)
		return div
	}

	Game.prototype.appendHealth = function (tileEl, hp, maxHp, isPlayer) {
		var h = document.createElement('div')
		h.className = 'health'
		h.style.width = clamp(Math.floor((hp / maxHp) * 100), 0, 100) + '%'
		tileEl.appendChild(h)
	}

	window.Game = Game
})()
