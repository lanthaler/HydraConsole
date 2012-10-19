<?php

require('../../../JsonLD/Test/bootstrap.php');

ini_set('html_errors', 0);

use ML\JsonLD\JsonLD;
use ML\JsonLD\Processor;
use ML\JsonLD\NQuads;

$options = new \stdClass();
$options->base = $_GET['url'];

$debug = isset($_GET['debug']) ? (boolean)$_GET['debug'] : false;

try
{
  $result = null;
  if ($debug) {
    $result = JsonLD::toString(JsonLD::expand($_GET['url'], $options, $debug));
  } else {
    $result = JsonLD::toString(JsonLD::parse($_GET['url']));
  }

  header('Content-Type: application/json');  // TODO Change media type - kept as json to be usable in Firebug ATM
  print $result;
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
}
