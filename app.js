var http = require('http'),
	express = require('express'),
	fs = require('fs'),
	crypto = require('crypto'),
	exec = require('child_process').exec,
	gm = require('gm'),
	dateformat = require('dateformat');

function Drive () {
	'use strict';
	var started = false;
	var optimised = true; // convert to gif before saving (stats: 268jpg: optimised 13s, not optimised 31s)
	var keepTemp = false;
	var app;

	var init = function() {
		// Setup App
		app = express();
		app.use(express.urlencoded());
		app.use(express.limit('3mb'));
		app.use(app.router);
		app.use('/assets', express.static(__dirname + '/assets'));

		// Routes
		app.use(function(err, req, res, next){ // Exception
			log(err);
			res.status(err.status || 500);
			res.end('Internal Error.');
		});

		app.get('/', function(req, res){
			res.sendfile(__dirname + '/index.html');
		});
		app.all('/trip/*', function(req, res, next) {
			var id = getId(req.params[0]);
			log(id, 'Query trip: ' + req.params[0].replace(/\./g, ' '));
			if (fs.existsSync(__dirname + '/exports/' + id + '.gif'))
				sendGif(req, res, id, true);
			else if (req.body && req.body.records) {
				var records = JSON.parse(req.body.records);
				if (records.length > 2)
					downThemAll(req, res, id, records);
				else
					res.end('Not enough images.\nPlease drive a longer itinerary.');
			}
			else
				res.redirect(301, '/');
		});
	};

	var downThemAll = function(req, res, id, files) {
		var count = 0;
		var total = files.length;
		var remaining = total;
		log(id, 'Downloading ' + total + ' streetviews');
		function leechThemAll() {
			if (files.length > 0) {
				var index = ++count;
				var path = files.shift();
				var file = path.substring(path.lastIndexOf('/') + 1);
				http.get(path, function(fileres) {
					var filename = id + '-' + zeroPad(index, 1000) + '.jpg';
					var p = __dirname + '/temp/';

					if (optimised) { // Use a GraphicsMagick stream
						gm(fileres, filename).write(p + filename.replace('jpg', 'gif'), function (err) {
							if (err) console.log(err);
							else { --remaining; leechThemAll(); }
						});
					}
					else {
						var stream = fs.createWriteStream(p + filename);
						fileres.on("end", function() { --remaining; leechThemAll() });
						fileres.pipe(stream);
					}
				}).on('error', function(e) {
					log(id, 'Error: ' + e.message);
					leechThemAll();
				});
			}
			else if (remaining === 0)
				gify(req, res, id);
		}
		for (var i = 0; i < 5; i++)
			leechThemAll();
		res.writeHead(200, { 'Content-Type': 'image/gif' }); // Make the browser wait!
	};

	var gify = function(req, res, id) {
		var filename = id + '.gif';
		log(id, 'Generating gif');
		exec('cd ' + __dirname + '/temp;' +
			(optimised ? '' : 'mogrify -format gif ' + id + '*.jpg;') +
			'gifsicle --delay=20 --method blend-diversity --colors 256 --loop ' + id + '*.gif > ../exports/' + filename + ';' +
			(!keepTemp ? 'rm ' + id + '*' : ''),
			function(error, stdout, stderr) {
				sendGif(req, res, id);
		});
	}

	var sendGif = function(req, res, id, headers) {
		var readStream = fs.createReadStream(__dirname + '/exports/' + id + '.gif');
		if (headers) res.writeHead(200, { 'Content-Type': 'image/gif' });
		readStream.pipe(res);
		log(id, 'Sending gif');
	}

	var log = function(id, message) {
		var text = '[' + dateformat("hh:MM:ss") + ']' + (id ? '[' + id + '] ' : ' ') + message;
		console.log(text);
	};

	var zeroPad = function(nr, base){
		base = base || 10;
		var  len = (String(base).length - String(nr).length)+1;
		return len > 0 ? new Array(len).join('0')+nr : nr;
	};

	var getId = function(query) {
		return crypto.createHash('md5').update(query).digest("hex").substring(0, 5);
	};

	var start = function(callback) {
		var port = 80;
		app.listen(port, '0.0.0.0', 551, callback).on('error', function (e) {
			if(e.code == 'EADDRINUSE') log(null, "Error, address is already in use.");
			started = false;
		});
		started = true;
		log(null, 'Starting server on port ' + port);
	};

	var stop = function() {
		app.close();
		started = false;
		log(null, 'Stopping server');
	};

	var isStarted = function() {
		return started;
	};

	init();
	return {
		'isStarted': isStarted,
		'start': start,
		'stop': stop,
		'app': app
	};
}

var drive = new Drive();
if (module.parent)
	exports.app = drive.app;
else
	drive.start();