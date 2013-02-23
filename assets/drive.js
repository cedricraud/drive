/*
 * Driver is in charge of the path resolution, street view recording and UI
 * @param {boolean} debug Set to true to display navigation markers on the map
 * @param {boolean} debugStreetView Set to true to display the Street View embed
 */
function Driver(debug, debugStreetView) {
  'use strict';
  var self = this;
  var directionsService, streetviewService;
  var map, directions, streetview;
  var moving = false;
  var pov = { heading: 352, pitch: 3, zoom: 1 };
  var pos = new google.maps.LatLng(46.34, 2.60);
  var lastPos;
  var smoothHeading = 0;
  var nextLink = {};
  var panoHistory = {};
  var car;
  var markers = [];
  var debugMarker1, debugMarker2;
  var steps = [];
  var records = [];

  function posmod(value, mod) {
    value = value  % mod;
    if (value < 0) value += mod;
    return value;
  }

  function getUrl(size, position) { 
    var p = position ? position : pos;
    var lat = p.lat();
    var lng = p.lng();
    var s = size ? size : '400x200';
    var heading = pov.heading;
    
    if (!position) {
      smoothHeading = Math.floor(pov.heading * 0.7 + smoothHeading * 0.3);
      heading = smoothHeading;
    }

    var params = 'location={lat},{lng}&heading={heading}&size={size}&fov=110&sensor=false&key=AIzaSyB6MKMJ9iXY3G4hcv9Oixt0FedLlCdxHeE'
              .replace('{lat}', lat)
              .replace('{lng}', lng)
              .replace('{heading}', heading)
              .replace('{size}', s);
    return 'http://maps.googleapis.com/maps/api/streetview?' + params;
  }

  function record() {
    var url = getUrl();
    records.push(url);
    //console.log('Recorded url: ', url);
  }

  function applyPano(data) {
    pos = data.location.latLng;
    
    // Find Suggested Heading
    var nextHeading = 0;
    var step = 0;
    var minDistance = 90000;

    for(var i = 0; i < steps.length; i++) {
      var distance = google.maps.geometry.spherical.computeDistanceBetween(pos, steps[i]);
      if (distance < minDistance) {
        step = i;
        minDistance = distance;
        if (i + 1 < steps.length) {
          nextHeading = google.maps.geometry.spherical.computeHeading(steps[i], steps[i + 1]);
          if (debug) {
            debugMarker1.setPosition(steps[i]);
            debugMarker2.setPosition(steps[i + 1]);
          }
        }
      }
    }
    for (var j = 0; j < step; j++)
      steps.shift();

    // Find Next Link
    var links = data.links;
    var link = null;
    var minDelta = 360;

    var heading = posmod(nextHeading, 360);
    if (debug) console.log('Heading: ' + heading);
    for (var k in links) {
      var delta = posmod(links[k].heading - heading, 360);
      if (delta > 180) delta = 360 - delta;
      if (debug) console.log(links[k].heading + ', ' + links[k].description + ' with delta: ' + delta);
      if (delta < minDelta) {
        link = links[k];
        minDelta = delta;
      } 
    }
    
    if (!link || !link.pano || panoHistory[link.pano]) {
      nextLink = null;
    }
    else {
      if (debug) console.log('Found: ' + link.heading + ', ' + link.description + ' with score: ' + minDelta);
      panoHistory[link.pano] = true;
      nextLink = link;
    }

    // Record
    if (moving) record();

    // Car
    car.setPosition(pos);

    // Thumbnails
    if (moving) {
      if (!lastPos) lastPos = pos;
      if (google.maps.geometry.spherical.computeDistanceBetween(pos, lastPos) >= 150) {
        markers.push(new google.maps.Marker({ 
          position: pos,
          animation: google.maps.Animation.DROP,
          icon: new google.maps.MarkerImage(getUrl('60x60', pos), new google.maps.Size(60, 45)),
          map: map
        }));
        lastPos = pos;
      }
      map.setCenter(pos);
    }

    // Street View (debug)
    if (streetview) {
      streetview.setPosition(pos);
      document.getElementById('streetview').style.display = 'block';
    }
  }

  function setPano(panoId, callback) {
    streetviewService.getPanoramaById(panoId, function(data) {
      applyPano(data);
      if (callback) callback(data);
    });
  }

  function setPos(latLng, callback) {
    streetviewService.getPanoramaByLocation(latLng, 50, function(data) {
      if (data && data.location && data.location.latLng) {
        applyPano(data);
        if (callback) callback(pos);
      }
      else if (callback) callback(null);
    });
  }

  function setPov(p0v) {
    pov = p0v;
    if (streetview) streetview.setPov(p0v);
  }

  function setHeading(heading) {
    pov.heading = heading;
    setPov(pov);
  }

  function fitBounds(map, steps) {
    var bound = new google.maps.LatLngBounds();
    var startPosition = steps[0];
    var endPosition = steps[steps.length -1];
    bound = bound.extend(startPosition);
    bound = bound.extend(endPosition);
    map.fitBounds(bound);
  }

  var onDirections = function() {
    // Invalidate
    document.body.className = '';
    records = [];

    // Set Display
    var myRoute = directions.directions.routes[0].legs[0];
    document.getElementById('startAddress').value = myRoute.start_address;
    document.getElementById('endAddress').value = myRoute.end_address;
    location.hash = (myRoute.start_address + ' ➔ ' + myRoute.end_address).replace(/ /g, '.');

    // Reset
    while(markers.length > 0) {
      var marker = markers.pop();
      marker.setMap(null);
    }
    steps = [];
    // Set
    var markerSet = {};
    var count = 0;
    for (var i = 0; i < myRoute.steps.length; i++) {
      for(var j = 0; j < myRoute.steps[i].lat_lngs.length; j++) {
        var current = myRoute.steps[i].lat_lngs[j];
        var id = current.lat() + '-' + current.lng();
        if (!markerSet[id]) {
          if (debug) 
            markers.push(new google.maps.Marker({ 
              position: current,
              icon: new google.maps.MarkerImage('http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld='+
                steps.length + '|ff7c70'),
              map: map }));
          steps.push(current);
          markerSet[id] = true;                      
        }
      }
    }
    fitBounds(map, steps);
    setPos(steps[0], function(pos) {
      if (pos) {
        document.getElementById('search').style.display = 'none';
        document.getElementById('start').style.display = 'inline-block';
        document.getElementById('start').style.opacity = 1;

        // Face the good direction
        if (nextLink) {
          smoothHeading = nextLink.heading;
          setHeading(smoothHeading);
          if (debug) console.log("Street View found, heading: ", smoothHeading);
        }
      }
      else
        alert("Street View is not available at this address.");
    });
  }

  // Interface
  this.finished = function() {
    document.body.className = 'preview';
    document.getElementById('loading').style.display = 'none';
    document.getElementById('search').style.display = 'inline-block';
  }

  this.invalidate = function(e) {
    document.getElementById('search').style.display = 'inline-block';
    document.getElementById('start').style.display = 'none';
    document.body.className = '';
    if (e && e.keyCode == 13) self.search();
  }

  this.search = function() {
    var request = {
      origin: document.getElementById('startAddress').value,
      destination: document.getElementById('endAddress').value,
      travelMode: google.maps.DirectionsTravelMode.DRIVING
    };
    directionsService.route(request, function(response, status) {
      if (status == google.maps.DirectionsStatus.OK) {
        var myRoute = response.routes[0].legs[0];
        
        document.getElementById('directions').textContent = '';
        document.getElementById('directions').style.opacity = 1;
        directions.setDirections(response);
      }
      else {
        alert('Directions not found between the two addresses.');
        console.log(response);
      }
    });
  }

  this.move = function(once) {
    if (once || moving) {
      if (debug) console.log("Move", nextLink, steps);
      if (steps.length === 0 || google.maps.geometry.spherical.computeDistanceBetween(pos, steps[steps.length - 1]) < 20)
        self.stop();
      else {
        if (nextLink) {
          setHeading(nextLink.heading);
          setPano(nextLink.pano, once ? null : function() { self.move() });
        }
        else {
          // If no path if found, jump to the next step
          if (steps.length > 0) {
            var step = steps.shift();
            setPos(steps.length === 0 ? step : steps[0], function() { self.move(once) });
            if (debug) console.log('Jump around!');
          }
          else
            self.move(once);
        }
      }
    }
  };

  this.start = function() {
    moving = true;
    self.move();
    if (map.getZoom() < 16) map.setZoom(16);
    document.getElementById('start').style.opacity = 0;
    document.getElementById('start').style.display = 'none';
    document.getElementById('stop').style.display = 'inline-block';
    
  };

  this.stop = function() {
    moving = false;
    document.getElementById('loading').style.display = 'inline-block';
    document.getElementById('stop').style.display = 'none';
    document.getElementById('records').value = JSON.stringify(records);
    document.getElementById('form').action = 'trip/' + encodeURIComponent(location.hash.substring(1));
    document.getElementById('form').submit();
  };

  // Init
  function init() {
    // Services
    streetviewService = new google.maps.StreetViewService();
    directionsService = new google.maps.DirectionsService();

    // Map
    map = new google.maps.Map(document.getElementById('map'), {
      zoom: 2,//16
      mapTypeControl: false,
      disableDefaultUI: false,
      mapTypeId: google.maps.MapTypeId.ROADMAP,
      center: pos
    });

    // Directions
    directions = new google.maps.DirectionsRenderer({
      draggable: true,
      preserveViewport: true,
      map: map,
      panel: document.getElementById('directions')
    });
    google.maps.event.addListener(directions, 'directions_changed', onDirections);

    // Car
    car = new google.maps.Marker({
      map: map,
      draggable: false,
      position: pos,
      icon: new google.maps.MarkerImage('assets/car.png'),
      zIndex: google.maps.Marker.MAX_ZINDEX
    });

    // Trip
    document.getElementById('trip').addEventListener('load', function() {
      self.finished();
    })

    // Debug
    if (debug) {
      document.getElementById('move').style.display = 'inline-block';
      debugMarker1 = new google.maps.Marker({
        map: map,
        icon: new google.maps.MarkerImage('http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|F23F87'),
        zIndex: google.maps.Marker.MAX_ZINDEX - 2
      });
      debugMarker2 = new google.maps.Marker({
        map: map,
        icon: new google.maps.MarkerImage('http://chart.apis.google.com/chart?chst=d_map_pin_letter&chld=%E2%80%A2|F2BC3F'),
        zIndex: google.maps.Marker.MAX_ZINDEX - 1
      });
    }

    // Street View (debug)
    if (debugStreetView) {
      streetview = new google.maps.StreetViewPanorama(document.getElementById('streetview'), {
        pov: pov,
        visible: true,
        panControl: false,
        linksControl: debug,
        zoomControl: true,
        addressControl: debug,
        clickToGo: true
      });
    }

    // Auto Start
    var hash = location.hash.replace(/\./g, ' ').substring(1);
    var addrs = hash.split(/➔|%94/); // damnit safari
    if (addrs.length == 2) {
      document.getElementById('startAddress').value = addrs[0].trim();
      document.getElementById('endAddress').value = addrs[1].trim();
      self.search();
    }
  }

  init();
}
