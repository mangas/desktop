/* jshint node: true */
'use strict';

var gutil = require('gulp-util');

var SUPPORTED_PLATFORMS = ['win32', 'linux32', 'linux64', 'osx64'];

var gulp = require('gulp');
var shell = require('gulp-shell');
var os = require('os');
var fs = require('fs');
var s3 = require('s3');
var path = require('path');
var rimraf = require('rimraf');
var manifest = require('./package.json');
var template = require('lodash.template');
var Builder = require('node-webkit-builder');
var appmanifest = require('./nwapp/package.json');

var LATEST_HTML_TEMPLATE = template(fs.readFileSync('./latest-template.html').toString());

var CURRENT_OS = (os.platform().match(/darwin/) ? 'osx' : os.platform());

var YEAR = new Date().getFullYear();
var CACHE_DIR = './cache';
var OUTPUT_DIR = './opt';
var SOURCE_DIR = './nwapp';

var SIGN_IDENTITY = 'Developer ID Application: Troupe Technology Limited (A86QBWJ43W)'; // To use this identity you must have the appropriate Developer ID cert in your keychain

var CERTIFICATES_DIR = './certificates';
var CERTIFICATES_FORMAT = {
  'win': 'troupe-cert.pfx',
  'osx': 'DeveloperID.p12'
};

var ARTEFACTS_DIR = './artefacts';
var LINUX_ARTEFACT_TEMPLATE = template('<%= name %>_<%= version %>_<%= arch %>.deb');

var ARTEFACTS = {
  'win': template('<%= name %>Setup-<%= version %>.exe')({ name: appmanifest.name, version: appmanifest.version }),
  'osx': template('<%= name %>-<%= version %>.dmg')({ name: appmanifest.name, version: appmanifest.version }),
  'linux32': LINUX_ARTEFACT_TEMPLATE({ name: appmanifest.name.toLowerCase(), version: appmanifest.version, arch: 'i386' }),
  'linux64': LINUX_ARTEFACT_TEMPLATE({ name: appmanifest.name.toLowerCase(), version: appmanifest.version, arch: 'amd64' }),
};

var ARTEFACTS_URL = Object.keys(ARTEFACTS).reduce(function (fold, item) {
  fold[item] = path.join(item, ARTEFACTS[item]);
  return fold;
}, {});

var S3_CONSTS = {
  buckets: {
    certificates: 'troupe-certs',
    updates: 'update.gitter.im'
  },
  handleError: function (err) {
    gutil.log(err.stack);
  },
  handleProgress: function (msg, file) {
    if (!this) {
      return gutil.log(gutil.colors.red('no progress report'));
    }
    var progress = ~~((this.progressAmount / this.progressTotal) * 100);
    if (progress % 50 !== 0) return;
    gutil.log(msg, gutil.colors.cyan('\'' + file + '\''), progress + '%');
  }
};

var s3Client = s3.createClient({
  s3Options: {
    accessKeyId: S3_CONSTS.credentials && S3_CONSTS.credentials.key,
    secretAccessKey: S3_CONSTS.credentials && S3_CONSTS.credentials.secret
  },
});

function namespace(/* args */) {
  return [].slice.call(arguments).join(':');
}

function fetchS3(params, done) {
  var downloader = s3Client.downloadFile(params);
  downloader.on('error', S3_CONSTS.handleError.bind(downloader));
  downloader.on('progress', S3_CONSTS.handleProgress.bind(downloader, 'Downloading', params.localFile));
  downloader.on('end', done);
}

function pushS3(params, done) {
  var uploader = s3Client.uploadFile(params);
  uploader.on('error', S3_CONSTS.handleError.bind(uploader));
  uploader.on('progress', S3_CONSTS.handleProgress.bind(uploader, 'Uploading', params.localFile));
  uploader.on('end', done);
}

[OUTPUT_DIR, ARTEFACTS_DIR, CACHE_DIR].forEach(function (dir) {
  gulp.task('clean:' + path.basename(dir).toLowerCase(), function (done) {
    rimraf(dir, done);
  });
});

gulp.task('clean', [OUTPUT_DIR, ARTEFACTS_DIR, CACHE_DIR].map(function (dir) { return 'clean:' + path.basename(dir); }));

/* certificate:fetch:{{ OS }} */
Object.keys(CERTIFICATES_FORMAT).forEach(function (OS) {
  var file = CERTIFICATES_FORMAT[OS];
  gulp.task('cert:fetch:' + OS, fetchS3.bind(null, {
    localFile: path.join(CERTIFICATES_DIR, file),
    s3Params: {
      Bucket: S3_CONSTS.buckets.certificates,
      Key: file,
    },
  }));
});

/* fetches the current os certificate */
gulp.task('cert:fetch', ['cert:fetch:' + CURRENT_OS]);

gulp.task('build', ['clean:opt', 'clean:artefacts'], function (done) {
  fs.mkdirSync(ARTEFACTS_DIR);
  var builder = new Builder({
    appName:    'Gitter',
    buildDir:   OUTPUT_DIR,
    version:    manifest.nwversion,
    files:      [path.join(SOURCE_DIR, '**')],
    platforms:  SUPPORTED_PLATFORMS,
    winIco:     './icons/gitter.ico',
    macIcns:    './icons/AppIcon.icns',
    macPlist: {
      NSHumanReadableCopyright: 'Copyright © 2013-' + YEAR + ' Troupe Technology Limited. All rights reserved.',
      CFBundleIdentifier: 'com.gitter.desktop'
    }
  });

  builder.on('log', gutil.log.bind(gutil, 'nw-builder:'));
  builder.build().nodeify(done);
});

gulp.task('build:linux', ['pack:deb:32', 'pack:deb:64']);
gulp.task('build:osx', ['pack:osx']);
gulp.task('build:all', ['build:linux', 'build:osx']);

gulp.task('run', function (done){
  var builder = new Builder({
    version:    manifest.nwversion,
    files:      path.join(SOURCE_DIR, '**')
  });

  builder.on('log', gutil.log.bind(gutil, 'nw-builder:'));
  builder.run().nodeify(done);
});

// generated Debian/Ubuntu packages for 32 and 64 bit archs
[32, 64].forEach(function (arch) {

  var fpm = template('fpm -s dir -t deb -a <%= port %> -n <%= name %> --category Utility --after-install ./opt/Gitter/linux<%= arch %>/after-install.sh --after-remove ./opt/Gitter/linux<%= arch %>/after-remove.sh --url "https://gitter.im" --description "Where developers come to talk" --maintainer "Troupe Technology <support@gitter.im>" -p <%= output %> -v <%= version %> ./opt/Gitter/linux<%= arch %>/');
  var catsed = gutil.template('cat ./linux/<%= file %> | sed "s/{{arch}}/linux<%= arch %>/g" > ./opt/Gitter/linux<%= arch %>/<%= file %>');

  gulp.task('pack:templates:' + arch, ['build'], shell.task([ // this probably waits for build
    catsed({ arch: arch, file: 'gitter.desktop' }) ,
    catsed({ arch: arch, file: 'after-install.sh' }),
    catsed({ arch: arch, file: 'after-remove.sh' }),
    'cp ./icons/logo.png ./opt/Gitter/linux' + arch + '/logo.png'
  ]));

  gulp.task('pack:deb:' + arch, ['pack:templates:' + arch], shell.task(
    fpm({
      arch: arch,
      port: arch === 32 ? 'i386' : 'amd64',
      version: appmanifest.version,
      name: appmanifest.name.toLowerCase(),
      output: path.join(ARTEFACTS_DIR, ARTEFACTS['linux' + arch])
    })
  ));
});

var dmg_cmd = template('./osx/create-dmg/create-dmg --icon "<%= name %>" 311 50 --icon-size 32 --app-drop-link 311 364 --window-size 622 683 --volname "<%= name %>" --volicon "./icons/AppIcon.icns" --background "./icons/dmg-bg.png" "<%= output %>" "<%= path %>/Gitter/osx64/Gitter.app"');

// Only runs on OSX (requires XCode properly configured)
gulp.task('sign:osx', ['build'], shell.task([
  'codesign -v -f -s "'+ SIGN_IDENTITY +'" '+ OUTPUT_DIR +'/Gitter/osx64/Gitter.app/Contents/Frameworks/*',
  'codesign -v -f -s "'+ SIGN_IDENTITY +'" '+ OUTPUT_DIR +'/Gitter/osx64/Gitter.app',
  'codesign -v --display '+ OUTPUT_DIR +'/Gitter/osx64/Gitter.app',
  'codesign -v --verify '+ OUTPUT_DIR +'/Gitter/osx64/Gitter.app',
]));

// Only runs on OSX
if (ARTEFACTS.osx) {
  gulp.task('pack:osx', ['sign:osx'], shell.task(dmg_cmd({
    name: appmanifest.name,
    version: appmanifest.version,
    path: OUTPUT_DIR,
    output: path.join(ARTEFACTS_DIR, ARTEFACTS.osx)
  })));
}

// Generate auto-updater packages for Windows
gulp.task('autoupdate:zip:win', shell.task([
  'cd '+ OUTPUT_DIR + '/Gitter/win32; zip win32.zip ./* > /dev/null 2>&1',
  'mv '+ OUTPUT_DIR + '/Gitter/win32/win32.zip ' + ARTEFACTS_DIR + '/win32.zip',
]));

// Generate auto-updater packages for OSX
gulp.task('autoupdate:zip:osx', shell.task([
  'cd '+ OUTPUT_DIR + '/Gitter/osx64; zip -r osx.zip ./Gitter.app > /dev/null 2>&1',
  'mv '+ OUTPUT_DIR + '/Gitter/osx64/osx.zip '+ ARTEFACTS_DIR + '/osx.zip',
]));

gulp.task('autoupdate:push:osx', function (done) {
  pushS3({
    localFile: ARTEFACTS_DIR + '/osx.zip',
    s3Params: {
      Bucket: S3_CONSTS.buckets.updates,
      Key: 'osx/osx.zip',
      CacheControl: 'public, max-age=0, no-cache',
      ACL: 'public-read'
    }
  }, done);
});

gulp.task('autoupdate:push:win', function (done) {
  pushS3({
    localFile: ARTEFACTS_DIR + '/win32.zip',
    s3Params: {
      Bucket: S3_CONSTS.buckets.updates,
      Key: 'win/win32.zip',
      CacheControl: 'public, max-age=0, no-cache',
      ACL: 'public-read'
    }
  }, done);
});

gulp.task('manifest:push', function (done) {
  pushS3({
    localFile: SOURCE_DIR + '/package.json',
    s3Params: {
      Bucket: S3_CONSTS.buckets.updates,
      Key: 'desktop/package.json',
      CacheControl: 'public, max-age=0, no-cache',
      ACL: 'public-read'
    }
  }, done);
});

gulp.task('identity', function (done) {
  done();
});

Object.keys(ARTEFACTS).forEach(function (platform) {
  console.log(platform);

  var LATEST_TEMPLATE = template('latest_<%= platform %>.html');

  gulp.task(namespace('artefacts', 'push', platform), function (done) {
    pushS3({
      localFile: path.join(ARTEFACTS_DIR, ARTEFACTS[platform]),
      s3Params: {
        Bucket: S3_CONSTS.buckets.updates,
        Key: path.join(platform, ARTEFACTS[platform]),
        CacheControl: 'public, max-age=0, no-cache',
        ACL: 'public-read'
      }
    }, done);
  });

  // LATEST_HTML_TEMPLATE
  gulp.task(namespace('redirect', 'source', platform), function (done) {
    fs.writeFile(path.join(ARTEFACTS_DIR, LATEST_TEMPLATE({ platform: platform })), LATEST_HTML_TEMPLATE({ url: ARTEFACTS_URL[platform] }), done);
  });

  gulp.task(namespace('redirect', 'push', platform), function (done) {
    pushS3({
      localFile: path.join(ARTEFACTS_DIR, LATEST_TEMPLATE({ platform: platform })),
      s3Params: {
        Bucket: S3_CONSTS.buckets.updates,
        Key: path.join(platform, 'latest'),
        CacheControl: 'public, max-age=0, no-cache',
        ACL: 'public-read'
      }
    }, done);
  });
});

gulp.task('artefacts:push', Object.keys(ARTEFACTS).map(function (platform) { return namespace('artefacts', 'push', platform); }));
gulp.task('redirect:source', Object.keys(ARTEFACTS).map(function (platform) { return namespace('redirect', 'source', platform); }));
gulp.task('redirect:push', Object.keys(ARTEFACTS).map(function (platform) { return namespace('redirect', 'push', platform); }));

// gulp.task('build:win', ['build'], function (done) {

//   // shell.task([
//   //   s3cmd+'./'+ OUTPUT_DIR +'/Gitter/'+winInstaller+' '+s3bucket+'/win/',
//   //   s3cmd+'./'+ OUTPUT_DIR +'/Gitter/win32/win32.zip '+s3bucket+'/win/',
//   //   s3cmd+'--content-type "text/html" ./latest '+s3bucket+'/win/',
//   //   s3cmd+'./nwapp/package.json '+s3bucket+'/desktop/'
//   // ]));

//   // var winInstaller    = "GitterSetup-"+appmanifest.version+".exe";
//   // var winDownloadUrl  = "https://update.gitter.im/win/" + winInstaller;
//   // var uploader = s3Client.uploadFile({
//   //   localFile: 'README.md',
//   //   s3Params: {
//   //     Bucket: S3_CONSTS.buckets.updates,
//   //     Key: 'nwdev/README.md',
//   //     CacheControl: 'public, max-age=0, no-cache',
//   //     ACL: 'public-read'
//   //   },
//   // });
// });
