Repacker
=====

Repacker helps you modularise and re-use packer templates. Dont repeat yourself.

Things you can do with repacker:

Re-use pre-existing open-source packer templates with your own infrastructure;
Maintain libraries of provisioners/post-processors and apply them to multiple builds;
Safely pull in changes from upstream without having to manually merge templates.
Lots of other stuff

# Install
Make sure you have nodejs and packer installed, then run 

npm install -g repacker

# Run

Write a *Repackerfile* in your packer template's directory and invoke ```repacker```.

It will invoke packer to build the referenced templates, integrating all the transformations included in the Repackerfile.

# What happens then?

Repacker does the following steps:


1. Take an existing packer template from either:-
	1. a local file; 
	1. a remote git repo;
	1. an empty file.
1. Apply a set of transformations to it. 
	1. Each of the four packer template sections (variables, builders, provisioners, post-processors) can be transformed.
	1. The transformations applied are (in order)
		1. Replace a section;
		2. Include content in a section;
		3. Apply JSONPath edits

1. Execute packer with options
	1. only: run a specific builder
	2. vars: add variables to packer build command line.
	3. varfiles: add varfiles to the packer build commaind line

1. Move any output files to a specified location.


## Get the target template

todo

## Transformations

The transformations applied are as follows, in this order:-

1. Replace

Replace a packer section (variables, builders, provisioners, post-processors) with a fragment from the repacker file or another json or yaml file.

1. Include

Append content into a packer section with a fragment from the repacker file or another json or yaml file.

1. JSONpath edit

Use standard JSONpath to edit individual settings


## Execute

todo

## Move

todo

# Repacker file format
