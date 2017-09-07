#!/usr/bin/env node
var _ = require('lodash');
var program = require('commander');
var promisify = require('promisify-node');
var fs = promisify("fs");
var path = require('path');
const util = require('util');

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

	_.forIn(pakkafile.templates ,(vars,template)=>{

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

			_.forIn(pakkafile.includes ,(data,section)=>{
				if (section == "variables") {
					_.merge(packerTemplate.variables , pakkafile.includes.variables)
				} else {	
					packerTemplate[section].push(pakkafile.includes[section])
				}
			})

			return packerTemplate
		})
		.then((packerTemplate)=>{
			return JSON.stringify(packerTemplate, null, 4)
		})
		.then((packerTemplate)=>{

			stdout(JSON.stringify(vars));

			var switches = ['build'];
			_.forIn(vars.vars ,(value,key)=>{ 
				switches.push('-var');
				switches.push( key + '=' + value )
			})

			_.forEach(vars.varfiles, (value)=>{
				switches.push(`-var-file=${value}`);
			})

			switches.push('-');
			stdout(switches.join(' '));

			var child = spawn('packer' , switches);
			child.stdin.setEncoding('utf-8');
			child.stdout.setEncoding('utf-8');
			child.stderr.setEncoding('utf-8');

			child.stdout.on('data', stdout);
			child.stderr.on('data', stderr);

			child.on('error', stdout);

			child.stdin.write(packerTemplate);

			child.stdin.end(); 

		})
		.catch(console.error)

	});
})
.catch(console.error)





