# Drive

Drive is an [Node.js](http://nodejs.org) web app to explore the world from the couch.
Choose an start address, a destination and push Start: the app will fetch the Google Street View panoramas for you and generate an animated trip.

![Screenshot](https://raw.github.com/cedricraud/Drive/master/assets/screen.png)

You can try the app [here](http://drive.spyc.am).


## Making of
The web app lives in a client (drive.js) and a server (app.js).

The client in the browser fetches a list of street view urls and sends it to the server.
The server downloads the images, converts them to gif with [ImageMagick](http://www.imagemagick.org/script/index.php) and builds an animation with [Gifsicle](http://www.lcdf.org/gifsicle/).

## ChangeLog

1.1
* Drive now looks better on the iPad
* Restored the ability to zoom while driving
* New async loader
* Handle errors in trip generation
* Fixed utf8 url issues on Safari

1.0

* Animations are now displayed within the app
* Change directions by dragging the markers on the map
* User experience improvements (less glitches, more fun)
* Optimised access to Google APIs
* JS & CSS now live in their own files
* Better debug support (add ?debug or ?debug&streetview in url)
* Document a bit
* Fix wrong heading at start
* Fix safe jump when no street view is found on the path

0.1

* Street View previews on the map
* Directions panel
* Pretty link to gif animations
