HydraConsole
============

[Hydra][1] is a lightweight vocabulary to create hypermedia-driven Web APIs.
By specifying a number of commonly used concepts it renders the creation of
generic API clients possible. The HydraConsole is such a generic API client
in the form of a single-page web application.


Installation
------------

At the moment, the HydraConsole uses a [JSON-LD Processor][2] and a proxy
written in PHP to access and process responses of Web APIs. Thus, the
simplest way to install the HydraConsole is to use [Composer][3].

If you don't have Composer yet, download it following the instructions on
http://getcomposer.org/ or just run the following command:

    curl -s http://getcomposer.org/installer | php

Then, use Composer's `create-project` command to download the HydraConsole
and install all it's dependencies:

    php composer.phar create-project -s dev ml/hydra-console path/to/install

That's all. Just fire up your browser and point it to

    http://localhost/path/to/install/


Collaboration
------------

To participate in the development please file bugs and issues in the
issue tracker or submit pull requests. If there's enough interest I'll
create a dedicated mailing list in the future.

You can find more information about Hydra and a demo installation of the
HydraConsole on my homepage: http://www.markus-lanthaler.com/hydra/


[1]: http://www.markus-lanthaler.com/hydra/
[2]: http://m.lanthi.com/json-ld
[3]: http://getcomposer.org/
