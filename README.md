Repacker
=====

Repacker helps you modularise and re-use packer templates. Dont repeat yourself.

Things you can do with pakka:

Re-use pre-existing open-source packer templates with your own infrastructure;
Maintain libraries of provisioners/post-processors and apply them to multiple builds;
Safely pull in changes from upstream without having to manually merge templates.

# Install
Make sure you have nodejs and packer installed, then run 

npm install -g repacker

# Use

Write a *Repackerfile* in your packer template's directory and invoke ```pakka```.

It will invoke packer to build the referenced templates, integrating all the transformations included in the pakkafile.

TODO: examples.

