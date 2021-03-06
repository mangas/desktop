Gitter Desktop Client
=====================

[![Gitter](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/gitterHQ/desktop?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![Build Status](https://travis-ci.org/gitterHQ/desktop.svg?branch=master)](https://travis-ci.org/gitterHQ/desktop)

This is the desktop client for Linux, Windows and Mac OSX.

Latest Builds
-------------

For the official downloads, please visit [https://gitter.im/apps](https://gitter.im/apps).

Running The Development Version
-------------------------------

The Gitter Desktop client is written using [NW.js](http://nwjs.io/), but the only prerequisite is [node.js](http://nodejs.org/download) for your platfrom and npm 3+.

1. clone this repo: `git clone git@github.com:gitterHQ/desktop.git && cd desktop`
2. install all dependencies: `npm install`
3. generate your own [app oAuth credentials](https://developer.gitter.im/apps) where the redirect url is `app://gitter/oauth.html`
4. start the app with your credentials:
  * linux/osx: `OAUTH_KEY=yourkey OAUTH_SECRET=yoursecret npm start`
  * windows cmd: `set OAUTH_KEY=yourkey && set OAUTH_SECRET=yoursecret && npm start`
  * alternatively, put your keys and secrets in `nwapp/oauth.json`

Tray Icon on Ubuntu
-------------------
To see the Gitter tray icon run:

```
sudo apt-add-repository ppa:gurqn/systray-trusty
sudo apt-get update
sudo apt-get upgrade
```

More info [here](http://ubuntuforums.org/showthread.php?t=2217458).

Enabling Logging on Windows
---------------------------
1. Install [Sawbuck](https://code.google.com/p/sawbuck/). This tool will capture logs for all chrome-based applications.
2. Add "Content Shell" to your list of Providers in Sawbuck by adding these registry entries to your machine (NOTE the optional Wow6432Node key for x64 machines):
  1. Find:  `HKLM\SOFTWARE\[Wow6432Node\]Google\Sawbuck\Providers`
  2. Add a subkey with the name `{6A3E50A4-7E15-4099-8413-EC94D8C2A4B6}`
  3. Add these values:
    * Key: `(Default)`, Type: `REG_SZ`, Value: `Content Shell`
    * Key: `default_flags`, Type: `REG_DWORD`, Value: `00000001`
    * Key: `default_level`, Type: `REG_DWORD`, Value `00000004`
  
  Alternatively, use [this .reg file](http://cl.ly/1K0R2o1r1K0Z/download/enable-gitter-logging.reg) to do the above for you (in x86) (courtesy of @mydigitalself).
3. Start Sawbuck and go to `Log -> Configure Providers` and change Content Shell's Log Level to `Verbose`.
4. Start capturing logs by going to `Log -> Capture`.
5. Start up your Gitter app and watch those logs!

Releasing the app (win32 and linux32/64)
----------------------------------------
1. Build all app artefacts
  1. On osx/linux, run `gulp build:linux`
  2. On osx/linux, run `gulp cert:fetch:win`
  3. On windows, mount this project and run `windows/build.bat VERSION` (e.g `windows/build.bat 1.2.3`)
  4. On osx/linux, run `gulp autoupdate:zip:win`
  4. On osx/linux, run `gulp autoupdate:zip:osx`
  5. On osx/linux, create the redirect pages with `gulp redirect:source`
2. **Check that all the binaries work**. You should have:
  * GitterSetup-X.X.X.exe
  * Gitter-X.X.X.dmg
  * gitter_X.X.X_amd64.deb
  * gitter_X.X.X_i386.deb
  * latest_linux32.html
  * latest_linux64.html
  * latest_win.html
  * win32.zip
  * osx.zip
3. Publish the release (all uploads will throw a formatError!)
  1. on osx/linux, publish the artefacts by running:
    * `gulp artefacts:push:win`
    * `gulp artefacts:push:osx`
    * `gulp artefacts:push:linux32`
    * `gulp artefacts:push:linux64`
    * `gulp autoupdate:push:win`
    * `gulp autoupdate:push:osx`
  2. on osx/linux, publish the redirects by running:
    * `gulp redirect:push:win`
    * `gulp redirect:push:linux32`
    * `gulp redirect:push:linux64`
  3. on osx/linux, publish the autoupdate manifest by running `gulp manifest:push`

License
-------

MIT
