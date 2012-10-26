<?php

require('proxylib.php');
require('../../../JsonLD/Test/bootstrap.php');

ini_set('html_errors', 0);

use ML\JsonLD\JsonLD;
use ML\JsonLD\Processor;
use ML\JsonLD\NQuads;

$options = new \stdClass();
$options->base = $_GET['url'];

$debug = isset($_GET['debug']) ? (boolean)$_GET['debug'] : false;

$debugExpansion = function($document)
{
  if (0 === strlen(trim($document))) {
    return $document;
  }

  global $options;
  try
  {
    $result = JsonLD::toString(JsonLD::expand($document, $options, true));

    return $result;
  }
  catch (Exception $e)
  {
    $exceptionName = get_class($e);
    if (false !== ($pos = strrpos(get_class($e), '\\')))
    {
      $exceptionName = substr($exceptionName, $pos + 1);
    }

    header('HTTP/1.1 400 ' . $exceptionName); //Bad Request');
    print htmlspecialchars($e->getMessage());

    die();
  }
};


$proxy = new AjaxProxy();

if ($debug) {
  $proxy->setResponseModifier($debugExpansion);
}

$proxy->execute();
