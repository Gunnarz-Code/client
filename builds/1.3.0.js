const options = {
  'gun': '0',
  'color': '0',
  'armor': '0'
}

const svPacketTypes = {
  'ping': 1,
  'spawn': 2,
  'stateUpdate': 3,
  'kicked': 4,
  'joined': 5,
  'accountExists': 6,
  'accountExists2': 7,
  'loggedIn': 8,
  'dbOffline': 9,
  'loggedOut': 10,
  'alreadyLoggedIn': 11,
  'invalidCreds': 12
}

const clPacketTypes = {
  'ping': 1,
  'spawn': 2,
  'logout': 6,
  'login': 7,
  'register': 8,
  'connect': 9
}

var Game;
var serverList;
var btn = getElem('button-play')

class game {
    constructor() {
        this.player = createPlayer()
        this.socket = null
        this.canvas = {
            'elem': getElem("canvas"),
            'ctx': getElem("canvas").getContext("2d")
        }
    }
    spawn() {
        if (this.player.spawned || this.player.spawning) return;
        if (this.socket.connected) {
            this.player.spawning = true
            var buf = new ArrayBuffer(4)
            var dv = new DataView(buf)
            dv.setUint8(0, clPacketTypes.spawn)
            dv.setUint8(1, parseInt(options.gun))
            dv.setUint8(2, parseInt(options.color))
            dv.setUint8(3, parseInt(options.armor))
            this.socket.send(buf)
        }
    }
}

function initializeGame() {
    Game = new game()
    var ca = '.'
    Game.connectingAnimationLoop = setInterval(() => {
        if (ca.length > 3) ca = '.'
        btn.innerHTML = `Connecting${ca}`
        ca += '.'
    }, 500)
    changeColor(options.color)
    changeArmor(options.armor)
    setTimeout(() => {
        getServers().then(servers => {
            checkPing(servers)
        })
        .catch(error => {
            console.log(error)
            clearInterval(Game.connectingAnimationLoop)
            btn.style.fontSize = '29px'
            btn.style.letterSpacing = '1px'
            btn.innerHTML = 'Error fetching servers.'
            btn.style.backgroundPosition = '100%'
            btn.style.cursor = ''
            console.log('Error fetching servers.')
        })
    }, 500)
}

function createPlayer() {
    return {
        'spawned': false,
        'spawning': false,
        'id': null,
        'x': null,
        'y': null,
        'spdX': null,
        'spdY': null,
        'hp': null,
        'invincible': null,
        'gun': null,
        'color': null,
        'armor': null,
        'mouseAngle': null,
        'score': null,
        'kills': null,
        'perks': {
            '1': null,
            '2': null,
            '3': null,
            '4': null
        },
        'inView': {
            'obstacles': [],
            'bullets': [],
            'players': []
        }
    }
}

function getServers() {
  return fetch('https://api.gunnarz.tech/servers')
    .then(json => json.json())
}

function checkPing(servers) {
    if (!servers.error) {
        for(var i in servers) {
            console.log(`Testing ping to ${servers[i].city} ${servers[i].type}`)
            var url = servers[i].url
            var socket = new WebSocket(`wss://${url}`)
            var pings = 0
            socket.timeout = setTimeout(() => {
                if(i+1 == servers.length) {
                    serverList = servers
                    console.log('All ping servers were offline! Will now connect to the server at index 0')
                    connect(1)
                }
            }, 5000)
            var buf = new ArrayBuffer(1);
            var dv = new DataView(buf);
            
            dv.setUint8(0, clPacketTypes.ping);
            
            socket.binaryType = 'arraybuffer'
            socket.onopen = function() {
                clearTimeout(socket.timeout)
                socket.send(buf)
                socket.pingStartTime = Date.now()
            }
            socket.onmessage = function(msg) {
                if(pings < 4) {
                    if(new Uint8Array(msg.data)[0] == new Uint8Array(buf)[0]) {
                        socket.send(buf)
                        pings++
                    }
                }
                else {
                    servers[i].ping = (Date.now()-socket.pingStartTime)/4
                    socket.close()
                    serverList = servers
                    connect()
                }
            }
            socket.onerror = function() {
                console.log(`Failed to test ping to ${servers[i].city} ${servers[i].type}`)
            }
        }
    }
    else {
        clearInterval(Game.connectingAnimationLoop)
        btn.innerHTML = servers.error
        btn.style.backgroundPosition = '100%'
        btn.style.cursor = ''
        console.log(servers.error)
    }
}

function connect(pingFailed, url) {
    if(!url) {
        if(!pingFailed) {
            var ping = []
            var lowestLatency
            for(var i in serverList) {
                if(serverList[i].ping) ping.push(serverList[i].ping)
            }
            lowestLatency = serverList[ping.indexOf(Math.min(ping))]
        }
        else {
            lowestLatency = serverList[0]
        }
    }
    else {
        for(var i in serverList) {
            if(serverList[i].url == url) {
                lowestLatency = serverList[i]
                btn.innerText = 'Reconnecting...'
                break
            }
        }
    }
    console.log(`Attempting connection to ${lowestLatency.city} ${lowestLatency.type}`)
    Game.socket = new WebSocket(`wss://${lowestLatency.url}`)
    Game.socket.binaryType = 'arraybuffer'
    Game.socket.onopen = function() {
        console.log(`Connection to ${lowestLatency.city} ${lowestLatency.type} was successful`)
        if(url) btn.style.backgroundPosition = 'left'
        getElem("login").style.display = ''
        getElem("register").style.display = ''

        var connectBuf = new ArrayBuffer(1)
        var connectDv = new DataView(connectBuf)
        connectDv.setUint8(0, clPacketTypes.connect)
        Game.socket.send(connectDv)

        var buf = new ArrayBuffer(1)
        var dv = new DataView(buf)
        dv.setUint8(0, clPacketTypes.ping)

        Game.socket.onmessage = function(msg) {
            var opcode = new Uint8Array(msg.data)[0]
            var data = new Uint8Array(msg.data)
            switch(opcode) {
                case svPacketTypes.ping:
                    Game.socket.send(buf)
                    break
                case svPacketTypes.spawn:
                    break
                case svPacketTypes.stateUpdate:
                    break
                case svPacketTypes.kicked:
                    break
                case svPacketTypes.joined:
                    handleConnected(data, buf, lowestLatency)
                    break
                case svPacketTypes.accountExists:
                    handleAccExists(data)
                    break
                case svPacketTypes.accountExists2:
                    handleAccExists(data)
                    break
                case svPacketTypes.loggedIn:
                    handleLogin(data)
                    break
                case svPacketTypes.dbOffline:
                    handleDbOffline()
                    break
                case svPacketTypes.loggedOut:
                    handleLogout(data)
                    break
                case svPacketTypes.alreadyLoggedIn:
                    handleAlreadyLoggedIn()
                    break
                case svPacketTypes.invalidCreds:
                    handleInvalidCreds()
                    break
                default:
                    if(!Game.socket.errMsgSent) console.log(
                      `Packet type not recognized! If you think something's wrong, please do one of the following:
                      -DM a dev (nitrogem35#1661 or LightLord#4261 on Discord)
                      -Send me an email (nitrogem9@gmail.com)`.replace(/  +/g, '')
                    )
                    Game.socket.errMsgSent = true
                    break
            }
        }
    }
    Game.socket.onclose = function() {
        console.log(`Disconnected from ${lowestLatency.city} ${lowestLatency.type}`)
        var url = Game.socket.url.split("://")[1].replace('/', '')
        if(Game.socket.registering) {
          getElem("register-btn").innerText = 'Register'
        }
        if(Game.socket.loggingIn) {
          getElem("login-boton-menu").innerText = 'Login'
        }
        Game.socket = null
        Game.player = createPlayer()
        Game.canvas.elem.style.display = 'none'
        getElem("login").style.display = 'none'
        getElem("register").style.display = 'none'
        getElem("loggedInTxt").style.display = 'none'
        getElem("logout-btn").style.display = 'none'
        displayMain()
        clearInterval(Game.connectingAnimationLoop)
        btn.style.background = 'linear-gradient(to right, #64ff5a 50%, #ffaf1a 50%)'
        btn.style.backgroundSize = '200% 100%'
        btn.style.backgroundPosition = 'right'
        btn.innerText = 'Disconnected'
        btn.onclick = function() {
            connect(undefined, url)
        }
    }
}

function handleConnected(data, buf, lowestLatency) {
  Game.socket.connected = true
  Game.socket.send(buf)
  clearInterval(Game.connectingAnimationLoop)
  btn.innerText = `Play [${lowestLatency.population}/${lowestLatency.max}]`
  btn.style.cursor = 'pointer'
  btn.onclick = function() {
      Game.spawn()
  }
}

function handleAccExists(data) {
  Game.socket.registering = false
  if(data[0] == svPacketTypes.accountExists) {
    regErr('An account with that username already exists.', 'regName')
    getElem("register-btn").innerText = 'Register'
  }
  else {
    regErr('An account with that email already exists.', 'email')
    getElem("register-btn").innerText = 'Register'
  }
}

function handleLogin(data) {
  Game.socket.loggedIn = true
  Game.socket.registering = false
  Game.socket.loggingIn = false
  getElem("register-btn").innerText = 'Register'
  getElem("login-boton-menu").innerText = 'Login'
  displayMain()
  getElem("register").style.display = 'none'
  getElem("login").style.display = 'none'
  getElem("logout-btn").style.display = ''
  var username = new TextDecoder().decode(data.slice(1,data.length))
  getElem("loggedInTxt").style.display = ''
  getElem("loggedInTxt").innerText = `Logged in as ${username}`
}

function handleLogout(data) {
  getElem("loggedInTxt").style.display = 'none'
  getElem("logout-btn").style.display = 'none'
  getElem("register").style.display = ''
  getElem("login").style.display = ''
}

function handleDbOffline() {
  if(Game.socket.registering) {
    Game.socket.registering = false
    regErr("The database is currently offline.", "register-btn", "Register")
  }
  if(Game.socket.loggingIn) {
    Game.socket.loggingIn = false
    regErr("The database is currently offline.", "login-boton-menu", "Login")
  }
}

function handleAlreadyLoggedIn() {
  Game.socket.loggingIn = false
  regErr("Your account is already logged in!", "login-boton-menu", "Login")
}

function handleInvalidCreds() {
  Game.socket.loggingIn = false
  regErr("The credentials you provided did not match our records.", 
  "login-boton-menu", "Login")
}

function register() {
  if(Game.socket.registering) {
    return
  }
  Game.socket.registering = true
  getElem("register-btn").innerText = 'Registering...'
  var errorMsgs = document.querySelectorAll('#errorMessage')
  errorMsgs.forEach(function(node) {
    node.parentNode.removeChild(node);
  });
  var username = getElem("regName").value
  var email = getElem("email").value
  var password = getElem("regPassword").value
  var userError 
  var emailError
  var passError
  if(!username) {
    regErr('The username field is required.', 'regName')
    userError = true
  }
  else if(/[^0-9a-z]/gi.test(username)) {
    regErr('Username may only contain letters/numbers.', 'regName')
    userError = true
  }
  else if(username.length < 3) {
    regErr('Username must be at least 3 characters.', 'regName')
    userError = true
  }
  else if(username.length > 14) {
    regErr('Username may not be longer than 14 characters.', 'regName')
    userError = true
  }
  if(!email) {
    regErr('The email field is required.', 'email')
    emailError = true
  }
  else if(!/^\S+@\S+\.\S+$/.test(email)) {
    regErr('The email address must be valid.', 'email')
    emailError = true
  }
  if(!password) {
    regErr('The password field is required.', 'regPassword')
    passError = true
  }
  else if(password.length < 6) {
    regErr('The password must be at least 6 characters.', 'regPassword')
    passError = true
  }
  if(!userError) clearErr(getElem('regName'))
  if(!emailError) clearErr(getElem('email'))
  if(!passError) clearErr(getElem('regPassword'))
  if(userError || emailError || passError) {
    getElem("register-btn").innerText = 'Register'
    Game.socket.registering = false
  }
  else {
    Game.socket.send('\x08' + username + '\x00' + email + '\x00' + password)
  }
  
}

function login() {
  if(Game.socket.loggingIn) {
    return
  }
  Game.socket.loggingIn = true
  getElem("login-boton-menu").innerText = 'Logging in...'
  var errorMsgs = document.querySelectorAll('#errorMessage')
  errorMsgs.forEach(function(node) {
    node.parentNode.removeChild(node);
  });
  var userError
  var passError
  var username = getElem("name").value
  var password = getElem("password").value
  if(!username) {
    regErr('The username field is required.', 'name')
    userError = true
  }
  else if(/[^0-9a-z]/gi.test(username) && !/^\S+@\S+\.\S+$/.test(username)) {
    regErr('Username/Email is invalid.', 'name')
    userError = true
  }
  else if(username.length < 3) {
    regErr('bruh, what did you expect', 'name')
    userError = true
  }
  else if(username.length > 64) {
    regErr('-_-', 'name')
    userError = true
  }
  if(!password) {
    regErr('The password field is required.', 'password')
    passError = true
  }
  else if(password.length < 6) {
    regErr('seriously smh', 'password')
    passError = true
  }
  if(!userError) clearErr(getElem('name'))
  if(!passError) clearErr(getElem('password'))
  if(userError || passError) {
    getElem("login-boton-menu").innerText = 'Login'
    Game.socket.loggingIn = false
  }
  else {
    Game.socket.send('\x07' + username + '\x00' + password)
  }
}

function logout() {
  var buf = new ArrayBuffer(1)
  var dv = new DataView(buf)
  dv.setUint8(0, clPacketTypes.logout)
  Game.socket.send(buf)
}

function changeColor(a) {
    a = a.slice(-1)
    var oldColorStyle = getElem(`color${options.color}`).style
    oldColorStyle.boxSizing = ""
    oldColorStyle.border = ""
    options.color = a
    var newColorStyle = getElem(`color${options.color}`).style
    newColorStyle.boxSizing = "border-box"
    newColorStyle.border = "5px solid black"
}

function changeArmor(a) {
    a = a.slice(-1)
    var oldArmorStyle = getElem(`armor${options.armor}`).style
    oldArmorStyle.boxSizing = ""
    oldArmorStyle.border = ""
    oldArmorStyle.borderRadius = ""
    options.armor = a
    var newArmorStyle = getElem(`armor${options.armor}`).style
    newArmorStyle.boxSizing = "border-box"
    newArmorStyle.border = "6px solid black"
    newArmorStyle.borderRadius = "2px"
}

function displayMain() {
    getElem('main').style.display = ''
    getElem('title').style.display = ''
    getElem('guns-menu').style.display = 'none'
    getElem('flex-login').style.display = 'none'
    getElem('flex-register').style.display = 'none'
    Game.canvas.elem.style.display = 'none'
    getElem('body').style.background = 'url(assets/img/grid.png)'
    getElem('overlay').style.display = 'none'
}

function hideMain() {
  getElem('main').style.display = 'none'
  getElem('title').style.display = 'none'
}

function openLogin() {
  getElem('flex-login').style.display = ''
  getElem('flex-login').style.animation = 'openMenu .5s'
  getElem('flex-login').style.animationFillMode = 'forwards'
  getElem('overlay').style.display = ''
}

function closeLogin() {
  displayMain()
}

function openGuns() {
  hideMain()
  getElem('guns-menu').style.display = ''
  getElem('body').style.background = '#292a2d'
}

function closeGuns(){
  displayMain()
}

function openRegister() {
  getElem('flex-register').style.display = ''
  getElem('overlay').style.display = ''
  getElem('flex-register').style.animation = 'openMenu2 .5s'
  getElem('flex-register').style.animationFillMode = 'forwards'
}

function closeRegister() {
  displayMain()
}

function getElem(id) {
  return document.getElementById(id)
}

function setErr(elem) {
  elem.style.backgroundColor = '#F2DEDE'
}

function clearErr(elem) {
  elem.style.backgroundColor = ''
}

function regErr(text, id, dbOffline) {
  if(!dbOffline) setErr(getElem(id))
  else getElem(id).innerText = dbOffline
  getElem(id).insertAdjacentHTML('afterend',
      `<div id="errorMessage">${text}</div>`
  );
}

function onLoad(ms){
    clearInterval(load)
    loadingText.innerHTML = `Loaded (${ms}ms)`
    loadingText.style.animation = 'flash 1.8s'
    setTimeout(() => {
        loadingText.style.display = 'none'
        var titleDiv = getElem('title-div')
        var forceClick = getElem('force-click')
        titleDiv.style.display = ''
        setTimeout(() => { forceClick.style.display = '' }, 800)
        titleDiv.style.animation = 'moveTitleDown 1s'
        //getElem('main').style.display = ''
    }, 1750)
}

function loadMain(){
    var forceClick = getElem('force-click')
    var main = getElem('main')
    forceClick.style.animation = 'moveButtonOffscreen 1.2s'
    forceClick.style.animationFillMode = 'forwards'
    setTimeout(() => {
        forceClick.style.display = 'none'
        main.style.opacity = '0'
        main.style.display = ''
        main.style.animation = 'fadeIn 0.3s'
        main.style.animationFillMode = 'forwards'
        setTimeout(()=>{
            main.style.opacity = 1
            main.style.animation = ''
        },300)
        initializeGame()
    }, 600)
}

