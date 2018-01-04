#!/usr/bin/env node
const _ = require('lodash');
const crypto = require('crypto')
const glob = require("glob");
const mv = require('mv');
const jp = require('jsonpath');
const path = require('path');
const program = require('commander');
const promisify = require('promisify-node');
const spawn = require('child_process').spawn;
const tmp = require('tmp');
const url = require('url');
const util = require('util');
const promiseRetry = require('promise-retry');

yaml = require('js-yaml');

const fs = require("fs");
const fsp = promisify("fs");


// function collect (val, memo) {
//     memo.push(val);
//     return memo;
// }

var repackerfile;


function collect(val, memo) {
  memo.push(val);
  return memo;
}

program
	.version('0.0.1')
	.usage("[repackerfile]")
	.arguments('[repackerfile]')
	.option('-d, --debug', "Send JSON to stdout and don\'t run builds")
	.option('-v --var [key=value]', 'include a variable into packer build' , collect, [])
	.action((Repackerfile)=>{repackerfile = Repackerfile})
	.parse(process.argv);



if (!repackerfile) {
	repackerfile = "./Repackerfile"
}

var pullRepo = (repoPath,localPath,stdout,stderr) =>{
	return new Promise((resolve,reject)=>{

		var pullRepoProcess = spawn('git' , ['clone' , '--depth=1' , repoPath , '.'] , {cwd:localPath});

		pullRepoProcess.stdout.setEncoding('utf-8');
		pullRepoProcess.stderr.setEncoding('utf-8');

		pullRepoProcess.stdout.on('data', stdout);
		pullRepoProcess.stderr.on('data', stderr);

		pullRepoProcess.on('error', stdout);

		pullRepoProcess.on('close', (code) => {
			console.log(`repo pull exited with code ${code}`);
			if (code == 0 ){
				resolve(code)
			} else {
				reject(code)
			}
		});
	})
} 

function copyFile(source, target) {
    return new Promise(function(resolve, reject) {
        var rd = fsp.createReadStream(source);
        rd.on('error', rejectCleanup);
        var wr = fsp.createWriteStream(target);
        wr.on('error', rejectCleanup);
        function rejectCleanup(err) {
            rd.destroy();
            wr.end();
            reject(err);
        }
        wr.on('finish', resolve);
        rd.pipe(wr);
    });
}

function moveFileRetry(oldPath,newPath){
	return promiseRetry(function (retry, number) {
		if (typeof number == undefined) var number = 1;
		if (number > 1) {console.log("retrying move of "+ oldPath)}
		if (number > 20) {reject(new Error("Couldnt move files."))}
	    return moveFile(oldPath,newPath)
	    .catch(retry);
	})
}


function moveFile(oldPath,newPath) {
	return new Promise(function(resolve, reject) {
		mv(oldPath, newPath, {mkdirp: true, clobber:true}, function(err) {
			if(err) reject("couldnt move file " + err)
			else {
				console.log('moved files')
				resolve()
			}
		});
	})
}

function loadAndParseFragmentFileSync(filePath) {




	var file = fs.readFileSync(filePath)
	try {
		return yaml.safeLoad(file)
	} catch (e) {
		console.error("Could not parse the fragment file " + filePath + ". " + e)
		process.exit(4)
	}

}


fsp.readFile(repackerfile)
.then(yaml.safeLoad).catch((e)=>{console.log("could not open the specified Repackerfile: " + e) ; process.exit(1)})
.then((repackerfile)=>{

	_.forIn(repackerfile.templates ,(options,template)=>{

		var stdout = (text = "") => {
			var prefix = template;
			text = text.split('\n');
			_.forEach(text, (t)=>{
				console.log (prefix + ': ' + t)
			})	
		}

		var stderr = (text = "") => {
			var prefix = template;
			text = text.split('\n');
			_.forEach(text, (t)=>{
				console.error (prefix + ': ' + t)
			})	
		}

		var temporaryFolder = null;

		Promise.resolve()
		.then(()=>{
			if (template == "{}") {
				return Promise.resolve("{}")
			} else {
				if (options["repo"]){
					temporaryFolder = tmp.dirSync({unsafeCleanup:true});
					
					stdout(`pulling repo ${options["repo"]} into ${temporaryFolder.name}`)
					return pullRepo(options["repo"],temporaryFolder.name,stdout,stderr)
					.then(()=>{
						if (!options["varfiles"]) {
							options["varfiles"] = []
						}
						return Promise.all(
							_.map(options.varfiles, (file)=>{
								return copyFile(file , temporaryFolder.name + "/" + file)
							})
						)
					})
					.then(()=>{
						return fsp.readFile(temporaryFolder.name + "/" + template)
					})

				} else {
					// open the file
					return fsp.readFile(template)
				}
			}
		})
		.then(JSON.parse).catch((e)=>{console.log("could not open the specified template: " + e) ; process.exit(2)})
		.then((packerTemplate)=>{

			if (options["replace"]) {
				_.forEach(["variables","builders","provisioners","post-processors"] , (section)=>{

					if ( options["replace"][section] ) {

						var fragmentName = options["replace"][section]
						var newData;
						if ( typeof repackerfile.fragments[fragmentName] === "string" ) {
							newData = loadAndParseFragmentFileSync( repackerfile.fragments[fragmentName] );
						} else {
							newData = repackerfile.fragments[fragmentName]
						}

						if (section == "variables") {
							packerTemplate[section] = newData
						} else {
							packerTemplate[section] = [newData]
						}

					}
				})
			}
			return packerTemplate
		})
		.then((packerTemplate)=>{

			if (options["include"]) {
				_.forEach(["variables","builders","provisioners","post-processors"] , (section)=>{
					if (options["include"][section]) {
						var fragmentNames = options["include"][section]
						_.forEach(fragmentNames, (fragmentName)=>{
							
							var newData;
							if ( typeof repackerfile.fragments[fragmentName] === "string" ) {
								newData = loadAndParseFragmentFileSync( repackerfile.fragments[fragmentName] );
							} else {
								newData = repackerfile.fragments[fragmentName]
							}

							if (section == "variables") {
								if (packerTemplate["variables"]){
									_.merge(packerTemplate.variables , newData)
								} else {
									packerTemplate.variables = newData
								}
								
							} else {
								if (packerTemplate[section]){
									packerTemplate[section].push(newData)
								} else {
									packerTemplate[section] = newData
								}	
							}




						})
					}
				})
			}
			return packerTemplate
		})
		.then((packerTemplate)=>{

			stdout(JSON.stringify(options));

			var switches = ['build' , '-on-error=abort'];
			_.forIn(options.vars ,(value,key)=>{ 
				switches.push('-var');
				switches.push( key + '=' + value )
			})

			_.forEach(program.var ,(v)=>{ 
				var [key,value] = v.split('=')
				switches.push('-var');
				switches.push( key + '=' + value )
			})

			if (options["only"]) {
				switches.push(`-only=${options["only"]}`)
			}

			_.forIn(options.jsonpath,(value,jsonpath)=>{
				jp.value(packerTemplate, jsonpath, value)
			})


			if (program.debug) {
				stdout("switches: " + JSON.stringify(switches))
				stdout("template:")
				stdout(JSON.stringify(packerTemplate, null, 4))

				return;
			}

			if (temporaryFolder != null) {
				// copy all varfiles to target dir and rewrite varfiles 
				options.varfiles.forEach((file)=>{
					var fileName = path.basename(file);
					fsp.writeFileSync(temporaryFolder.name + "/" + fileName, fsp.readFileSync(file));
					switches.push(`-var-file=${fileName}`)
				})
				switches.push('-');
				var child = spawn('packer' , switches , {cwd:temporaryFolder.name});
			} else {
				_.forEach(options.varfiles, (value)=>{
					switches.push(`-var-file=${value}`);
				})
				switches.push('-');
				var child = spawn('packer' , switches , {cwd:process.cwd()});
			}

			return new Promise((resolve,reject)=>{
				try{
					child.stdin.setEncoding('utf-8');
					child.stdout.setEncoding('utf-8');
					child.stderr.setEncoding('utf-8');

					child.stdout.on('data', stdout);
					child.stderr.on('data', stderr);

					child.on('error', (error)=>{
						stdout(JSON.stringify(error))
					});

					child.on('exit',(code)=>{
						if (code == 0) {
							resolve()
						} else {
							reject(new Error("packer did not run successfully. The exit code was: " + code))
						}
					})

					child.stdin.write(JSON.stringify(packerTemplate, null, 4));

					child.stdin.end(); 
				} catch (e) {
					child.stdin.end(); 
					reject(new Error("packer did not run successfully: " + e))
				}
			})
		})
		.then(()=>{
			if (temporaryFolder){
				
				return new Promise((resolve,reject)=>{

					glob(temporaryFolder.name + "/output*", {}, function (er, files) {

						if (er) reject(er)

						// setTimeout(()=>{

							var moves = files.map((file)=>{
								stdout("moving " + file + " to " + process.cwd() + "/" + path.basename(file))
								return moveFileRetry(file, process.cwd() + "/" + path.basename(file))
							})

							Promise.all(moves)
							.then(()=>{
								console.log("removing temp directory")
								temporaryFolder.removeCallback()
							})
							.then(resolve,reject)

						// },500)
					})

				})
			}

		})
		.catch((err)=>{
			if (temporaryFolder) {
				console.log("removing temp directory")
				temporaryFolder.removeCallback()
			}
			console.error(console.log("repacker failed to process a template: " + err))
		});
	});
})
.catch(console.error)



// (e)=>{temporaryFolder.removeCallback()}

