#!/usr/bin/env node
const _ = require('lodash');
const crypto = require('crypto')
const jp = require('jsonpath');
const path = require('path');
const program = require('commander');
const promisify = require('promisify-node');
const spawn = require('child_process').spawn;
const tmp = require('tmp');
const url = require('url');
const util = require('util');

const fs = promisify("fs");


// function collect (val, memo) {
//     memo.push(val);
//     return memo;
// }

var pakkafile;

program
	.version('0.0.1')
	.usage("[pakkafile]")
	.arguments('[pakkafile]')
	.option('-d, --debug', "Send JSON to stdout and don\'t run builds")
	.action((Pakkafile)=>{pakkafile = Pakkafile})
	.parse(process.argv);


if (!pakkafile) {
	pakkafile = "./Pakkafile"
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
        var rd = fs.createReadStream(source);
        rd.on('error', rejectCleanup);
        var wr = fs.createWriteStream(target);
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



fs.readFile(pakkafile)
.then(JSON.parse).catch((e)=>{console.log("could not open the specified Pakkafile: " + e) ; process.exit(1)})
.then((pakkafile)=>{

	_.forIn(pakkafile.templates ,(options,template)=>{

		var stdout = (text) => {
			var prefix = template;
			text = text.split('\n');
			_.forEach(text, (t)=>{
				console.log (prefix + ': ' + t)
			})	
		}

		var stderr = (text) => {
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
					temporaryFolder = tmp.dirSync();
					
					stdout(`pulling repo ${options["repo"]} into ${temporaryFolder.name}`)
					return pullRepo(options["repo"],temporaryFolder.name,stdout,stderr)
					.then(()=>{
						return Promise.all(
							_.map(options.varfiles, (file)=>{
								return copyFile(file , temporaryFolder.name + "/" + file)
							})
						)
					})
					.then(()=>{
						return fs.readFile(temporaryFolder.name + "/" + template)
					})

				} else {
					// open the file
					return fs.readFile(template)
				}
			}
		})
		.then(JSON.parse).catch((e)=>{console.log("could not open the specified template: " + e) ; process.exit(2)})
		.then((packerTemplate)=>{

			if (options["include"]) {
				_.forIn(pakkafile.includes[options["include"]] ,(data,section)=>{
					if (section == "variables") {
						_.merge(packerTemplate.variables , pakkafile.includes[options["include"]].variables)
					} else {
						if (packerTemplate[section]){
							packerTemplate[section].push(pakkafile.includes[options["include"]][section])
						} else {
							packerTemplate[section] = pakkafile.includes[options["include"]][section]
						}	
					}
				})
			}

			return packerTemplate
		})
		.then((packerTemplate)=>{

			stdout(JSON.stringify(options));

			var switches = ['build'];
			_.forIn(options.vars ,(value,key)=>{ 
				switches.push('-var');
				switches.push( key + '=' + value )
			})

			_.forEach(options.varfiles, (value)=>{
				switches.push(`-var-file=${value}`);
			})

			if (options["only"]) {
				switches.push(`-only=${options["only"]}`)
			}

			_.forIn(options.jsonpath,(value,jsonpath)=>{
				jp.value(packerTemplate, jsonpath, value)
			})

			debugger;
			switches.push('-');
			stdout(switches.join(' '));

			if (program.debug) {
				stdout(JSON.stringify(packerTemplate, null, 4))
				return;
			}

			if (temporaryFolder != null) {
				var child = spawn('packer' , switches , {cwd:temporaryFolder.name});
			} else {
				var child = spawn('packer' , switches , {cwd:process.cwd()});
			}

			try{
				child.stdin.setEncoding('utf-8');
				child.stdout.setEncoding('utf-8');
				child.stderr.setEncoding('utf-8');

				child.stdout.on('data', stdout);
				child.stderr.on('data', stderr);

				child.on('error', stdout);

				child.stdin.write(JSON.stringify(packerTemplate, null, 4));

				child.stdin.end(); 
			} catch (e) {
				child.stdin.end(); 
			}

		})
		.catch((err)=>{
			// temporaryFolder.removeCallback()
			console.error(err)
		});
	});
})
.catch(console.error)



// (e)=>{temporaryFolder.removeCallback()}

