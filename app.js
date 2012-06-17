var flatiron = require('flatiron'),
    path     = require('path'),
    XRegExp  = require('xregexp').XRegExp,
    fs       = require('fs'),
    path     = require('path'),
    async    = require('async'),
    request  = require('request'),
    github   = require('octonode'),
    util     = require('util'),
    exec     = require('child_process').exec,
    username = 'XXXXXXXXXXXXX',
    password = 'XXXXXXXXXXXXX',
    app      = flatiron.app;



app.config.file({ file: path.join(__dirname, 'config', 'config.json') });

app.use(flatiron.plugins.cli, {
  source: path.join(__dirname, 'lib', 'commands'),
  usage: [
    '',
    'node-migrator-bot - Migrate your old Node.js Repos',
    '',
    'Usage:',
    '',
    '    node-migrator-bot repo <myrepo> - Takes the URL link to your repository on',
    '                                      git hub, forks it, does its thing, then',
    '                                      initates a pull request. If a folder',
    '                                      path is given, runs file op for every file',
    '    node-migrator-bot user <user>   - Takes a github username, forks all node.js',
    '                                      repositories, does its thing, then',
    '                                      initates a pull request on each repository',
    '    node-migrator-bot file <file>   - runs the bot on the file provided'
  ]
});

app.commands.repo = function file(link, cb) {
  this.log.info('Attempting to open path"' + link + '"');
  doRepoUpdate(link, cb);
};

app.commands.user = function file(user, cb) {
  this.log.info('Attempting get information on "' + user + '"');
  doUserRepoUpdateStart(user, cb);
};

app.commands.file = function file(filename, cb) {
  this.log.info('Attempting to open "' + filename + '"');
  doFileUpdate(filename, cb);
};

function doUserRepoUpdateStart(user, cb){
  var client   = github.client();
  app.log.info('Getting '+user.red.bold+'\'s list of Repositories...');
  client.get('/users/'+user+'/repos', function (err, status, data){
      if (err){
        app.log.error('error:  '+err);
        app.log.error('status: '+status);
        app.log.error('data:   '+data);
        return cb(err);
      }else{
        async.forEach(data, doUserRepoUpdate, cb);
      }
    });
  //async.forEach(results, doRepoUpdate ,cb);
}
function doUserRepoUpdate(repoData, cb){
  //app.log.info(repoData["html_url"]);
  doRepoUpdate(repoData["html_url"], cb);
}

function doRepoUpdate(link, cb){
  var re = /(http|ftp|https|git|file):\/\/(\/)?[\w-]+(\.[\w-]+)+([\w.,@?\^=%&amp;:\/~+#-]*[\w@?\^=%&amp;\/~+#-])?/gi;

  if (XRegExp.test(link, re)) {
    app.log.info(link.blue.bold+' is a url');
    forkAndFix(link, cb);
  }else{
    app.log.info(link.blue.bold+' is a folder');
    walkAndFix(link, cb);
  }
}
function forkAndFix(link, cb){
  var parse    = XRegExp(/.*github.com\/(.*)\/(.*?)(\.git$|$)/g);
  var user     = XRegExp.replace(link, parse, '$1');
  var repo     = XRegExp.replace(link, parse, '$2');
  var forkedRepo = 'https://github.com/'+username+'/'+repo;
  var tmpDir = path.resolve(path.join('.','tmp'));
  var repoLocation = path.resolve(path.join(tmpDir,repo)).toString();

  app.log.info('Forking '+user.magenta.bold+'/'+repo.yellow.bold);
  async.waterfall([
    function (callback){
      forkRepo( forkedRepo, username, user, repo, repoLocation, callback);
    },//fork
    function (forkedRepo, username, repo, repoLocation, callback){
      notifyAvailability(forkedRepo, username, repo, repoLocation, callback);
    },//,// wait for availability (whilst)
    function (forkedRepo, repoLocation, callback){
      cloneRepo(forkedRepo, repoLocation, callback);
    },// clone repo
    function (forkedRepo, repoLocation, callback){
      switchBranch(forkedRepo, repoLocation, callback);
    },// switch branch
    function (repoLocation, callback){
      walkAndFix(repoLocation, callback);//? lose all variables?
    },// walkAndFix
    function (callback){
      commitRepo(forkedRepo, repoLocation, callback);
    },// commit
    //function (callback){
      //pushCommit(forkedRepo, repoLocation, callback);
    //},// push
    function (callback){
      submitPullRequest( username, user, repo, callback);
    }// submit pull request
    ],
    function (err, results){//callback
      if (err) {
          return cb(err);
        }
        app.log.info('Status: '+results);
        app.log.info('Finished fixing '+link.blue.bold);
  });

}
function forkRepo( forkedRepo, username, user, repo, repoLocation, cb){
  var client   = github.client({
    username: username,
    password: password
  });

  client.me().fork(user+'/'+repo, function (err, data){
    if (err){
      app.log.error('error: '+err);
      app.log.error('data:  '+data);
      return cb(err);
    }else{
      return cb(null, forkedRepo, username, repo, repoLocation);
    }
  });
}
function submitPullRequest( username, user, repo, cb){
  /*var client   = github.client({
    username: username,
    password: password
  });
  */
  github.auth.config({
    username: username,
    password: password
  }).login(['user', 'repo', 'gist'], function (err, id, token) {
    app.log.info(id, token);//TODO: reuse tokens?

    url = 'https://api.github.com/repos/' + user + '/' + repo + '/pulls?access_token='+token;
    var foo = 'Hi';
    var bodyMessage = 'Hello '+user+',\n\nI am the node-migrator-bot, I am an '+
      '[open-source](https://github.com/blakmatrix/node-migrator-bot) robot '+
      'that will make changes to your code to hopefully fix the issue that '+
      'arises when you have require(\'sys\') in your code when running against '+
      'v 0.8+ versions of node. I will change your code to reflect the proper'+
      ' library \'util\'.\n\nIf you would like to see more take a look at '+
      'https://github.com/joyent/node/commit/1582cf#L1R51 or '+
      'https://github.com/joyent/node/blob/1582cfebd6719b2d2373547994b3dca5c8c569c0/ChangeLog#L51'+
      '\n\nThanks!\nYour Friendly Neighborhood '+
      '[node-migrator-bot](https://github.com/blakmatrix/node-migrator-bot)';
    var payload = '{\n'+
          '"title": "Hi! I migrated your code for you!",\n'+
          '"body": '+JSON.stringify(bodyMessage)+',\n'+
          '"base": "master",\n'+
          '"head": "'+username+':clean"\n'+
        '}';

    /*client.repo(username+'/'+repo).create_pull_request_comment(
      'id',
      {
        title: 'Hi! I migrated your code for you!',
        body: JSON.stringify(bodyMessage),
        base: 'master',
        head: username+':clean'
      },
      function (err, data){
      if (err){
        app.log.error('error: '+err);
        app.log.error('data:  '+data);
        cb(err);
      }else{
        return cb(null, 'done');
      }
    });*/
    app.log.debug('Attempting to make Pull Request to:\n'+url.green+' with the following payload:\n\n '+payload.cyan.bold);
    request.post({url:url, body: payload}, function (error, response, body) {
            if (!error && response.statusCode == 201) {//Status: 201 Created
              app.log.info('Pull Request to '+user+'/'+repo+' from '+username+'/'+repo+' Succesfull!');
              return cb(null,'Done with '+username+'/'+repo+'.');
            }else{
              //app.log.debug('response:');
              //app.log.debug(response.statusCode);
              //app.log.debug(response.body);
              app.log.error('error: '+error);
              if (error === null){
                try{
                  throw new Error( response.statusCode+' '+response.body.toString() );
                }catch(err){
                  cb(err);
                }
              }else{
               return cb(error);
              }
            }
    });
  });
}

function cloneRepo(forkedRepo, repoLocation, cb){
  app.log.info("Attempting to clone "+ forkedRepo.blue.bold);
  var cmd = 'git clone '+forkedRepo+' "'+repoLocation+'"';
  app.log.debug('calling: "'+cmd.grey+'"');
  var child = exec(cmd,
    function (error, stdout, stderr) {
      if (error !== null) {
        return cb(error);
      }else{
        app.log.info(forkedRepo.blue.bold+' Succesfully cloned to '+repoLocation.yellow.bold);
        return cb(null, forkedRepo, repoLocation);
      }
  });
}

function switchBranch(forkedRepo, repoLocation, cb){
  app.log.info("Attempting to switch branch on "+ repoLocation.blue.bold);
  var gitDir= path.resolve(path.join(repoLocation,'.git')).toString();
  var cmd1 = 'git --git-dir="'+gitDir+'" --work-tree="'+repoLocation +'" branch clean';
  var cmd2 = 'git --git-dir="'+gitDir+'" --work-tree="'+repoLocation +'" checkout clean';
  app.log.debug('calling: "'+cmd1.grey+'"');
  var child = exec(cmd1,
    function (error, stdout, stderr) {
      if (error !== null) {
        return cb(error);
      }else{
        app.log.info(forkedRepo.blue.bold+'@'+repoLocation.yellow.bold+':clean branch '+'created'.green);
        app.log.debug('calling: "'+cmd2.grey+'"');
        var child2 = exec(cmd2,
          function (error, stdout, stderr) {
            if (error !== null) {
              return cb(error);
            }else{
              app.log.info(forkedRepo.blue.bold+'@'+repoLocation.yellow.bold+':clean branch '+'checked out'.green.bold);
              return cb(null, repoLocation);
            }
        });
      }
  });
}

function commitRepo(forkedRepo, repoLocation, cb){
  var message = "[fix] Changed require('sys') to require('util') for migration issues";
  var gitDir= path.resolve(path.join(repoLocation,'.git')).toString();
  app.log.info("Attempting a commit on "+ repoLocation.blue.bold);
  var cmd = 'git --git-dir="'+gitDir+'" --work-tree="'+repoLocation +'" commit -am "'+message+'"';
  app.log.debug('calling: "'+cmd.grey+'"');
  var child = exec(cmd,
    function (error, stdout, stderr) {
      if (error !== null) {
        app.log.debug('stdout: ' + stdout);
        app.log.debug('stderr: ' + stderr);
        return cb(error);
      }else{
         app.log.info(forkedRepo.blue.bold+'@'+repoLocation.yellow.bold+':clean branch '+'COMMIT'.green.bold);
        return cb(null);
      }
  });
}
function pushCommit(forkedRepo, repoLocation, cb){
  var gitDir= path.resolve(path.join(repoLocation,'.git')).toString();
  app.log.info("Attempting a push commit on branch clean @"+ repoLocation.blue.bold);
  var cmd = 'git --git-dir="'+gitDir+'" --work-tree="'+repoLocation +'" push origin clean';
  app.log.debug('calling: "'+cmd.grey+'"');
  var child = exec(cmd,
    function (error, stdout, stderr) {
      app.log.debug('stdout: ' + stdout);
      app.log.debug('stderr: ' + stderr);
      if (error !== null) {
        app.log.debug('stdout: ' + stdout);
        app.log.debug('stderr: ' + stderr);
        return cb(error);
      }else{
         app.log.info(forkedRepo.blue.bold+'@'+repoLocation.yellow.bold+':clean branch '+'COMMIT PUSHED'.green.bold);
        return cb(null);
      }
  });
}

function notifyAvailability(forkedRepo, username, repo, repoLocation, cb){
  var count    = 0;
  var Available = false;
  async.until(// wait for availability (whilst)
      function () {
        if ( count % 2 === 0 ){
          app.log.info('Waiting for '+username.magenta.bold+'/'+repo.yellow.bold+' to become available...');
        }
        request.head(forkedRepo, function (error, response, body) {
          if (!error && response.statusCode == 200) {
            Available = true;
          }
        });
        return count > 300 || Available;
      },
      function (cb) {
          count++;
          setTimeout(cb, 2000);
      },
      function (err) {
          // 5 minutes have passed
          if (count > 300){
            app.log.error('Unable to find forked repo '+username.magenta.bold+'/'+repo.yellow.bold+' after 5 minutes.');

          }else{
          app.log.info('Forked repo '+username.magenta.bold+'/'+repo.yellow.bold+' Exists!');
          if (Available){
            return cb(null, forkedRepo, repoLocation);
          }else{
            return cb("error: Timeout");
          }
        }
      }
    );
}

function walkAndFix(link, cb){
  walk(link, function (err, results) {
      if (err) {
        return cb(err);
      }

      async.forEach(results, doFileUpdate ,cb);

    });
}
function walk(dir, done) {
  var results = [];
  fs.readdir(dir, function (err, list) {
    if (err){ return done(err);}
    var index = list.indexOf('.git');//remove git
    if (index >= 0){
      list.splice(index, 1);
    }
    var pending = list.length;
    if (!pending){ return done(null, results);}
    list.forEach(function (file) {
      file = path.resolve(path.join(dir,file));
      fs.stat(file, function (err, stat) {
        if (stat && stat.isDirectory()) {
          walk(file, function (err, res) {
            results = results.concat(res);
            if (!--pending){ done(null, results);}
          });
        } else {
          results.push(file);
          if (!--pending){ done(null, results);}
        }
      });
    });
  });
}

function doFileUpdate(filename, cb){
  fs.readFile(filename, function (err, data) {
    if (err) {
      return cb(err);
    }

    //app.log.info(data);
    //app.log.info("Regex");

    var re = /require\s*\(\s*['"]sys['"]\s*\)/g,
        reFull = /sys\s*=\s*require\s*\(\s*['"]sys['"]\s*\)/g,
        rePart = /sys\./g,
        replacement = "require('util')",
        replacementFull = "util = require('util')",
        replacementPart = 'util.',
        dataStr = data.toString();
        fixedDoc = '';

    if (XRegExp.test(dataStr, re)) {
      if (XRegExp.test(dataStr, reFull)) {
        fixedDoc = XRegExp.replace(XRegExp.replace(dataStr, rePart, replacementPart, 'all'), reFull, replacementFull, 'all');
      }
      else{
        fixedDoc = XRegExp.replace(dataStr, re, replacement, 'all');
      }
      //return cb(null, fixedDoc);
      // write changes out to file
      fs.writeFile(filename, fixedDoc, function (err) {
          if (err) {
            app.log.error('The file was not saved');
            return cb(err);
          } else {
            app.log.info(filename.blue.bold+' was modified and changed!');
            return cb(null);
          }
      });

    }
    else{
      app.log.debug('No '+'require("sys")'.magenta.bold+' text found in '+filename.blue.bold+", no modifications made.");
      return cb(null);
    }
  });
}

app.start( function (err){
  if (err) {
    app.log.error(err.message || 'You didn"t call any commands!');
    app.log.warn('node-migrator-bot'.grey + ' NOT OK.');
    return process.exit(1);
  }
  app.log.info('node-migrator-bot'.grey + ' ok'.green.bold);
});

