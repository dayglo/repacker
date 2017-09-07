#!/usr/bin/env node
var _ = require('lodash');
var program = require('commander');
var promisify = require('promisify-node');
var fs = promisify("fs");
var path = require('path');
const util = require('util');

const jp = require('jsonpath');

var spawn = require('child_process').spawn;
var crypto = require('crypto')

function collect (val, memo) {
    memo.push(val);
    return memo;
}


var pakkafile;

program
	.version('0.0.1')
	.usage("[pakkafile]")
	.arguments('[pakkafile]')
	.action((Pakkafile)=>{pakkafile = Pakkafile})
	.parse(process.argv);


if (!pakkafile) {
	pakkafile = "./Pakkafile"
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

		fs.readFile(template)
		.then(JSON.parse).catch((e)=>{console.log("could not open the specified template: " + e) ; process.exit(2)})
		.then((packerTemplate)=>{

			if (options["include"]) {
				_.forIn(pakkafile.includes[options["include"]] ,(data,section)=>{
					if (section == "variables") {
						_.merge(packerTemplate.variables , pakkafile.includes[options["include"]].variables)
					} else {	
						packerTemplate[section].push(pakkafile.includes[options["include"]][section])
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

			var child = spawn('packer' , switches);
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
		.catch(console.error);
	});
})
.catch(console.error)





