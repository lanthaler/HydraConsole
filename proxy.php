<?php

require('proxylib.php');
require('../../vendor/autoload.php');

ini_set('html_errors', 0);

use ML\JsonLD\JsonLD;
use ML\JsonLD\Processor;


// Mimic apache_request_headers() if not present (adapted from PHP doc)
if(!function_exists('apache_request_headers')) {
  function apache_request_headers() {
    $arh = array();
    $rx_http = '/\AHTTP_/';
    foreach ($_SERVER as $key => $val) {
      if (preg_match($rx_http, $key)) {
        $arh_key = preg_replace($rx_http, '', $key);
        $rx_matches = array();
        // do some nasty string manipulations to restore the original letter case
        // this should work in most cases
        $rx_matches = explode('_', $arh_key);
        if (count($rx_matches) > 0 and strlen($arh_key) > 2) {
          foreach($rx_matches as $ak_key => $ak_val) {
            $rx_matches[$ak_key] = ucfirst(strtolower($ak_val));
          }
          $arh_key = implode('-', $rx_matches);
        }
        $arh[$arh_key] = $val;
      }
    }
    return $arh;
  }
}


$options = new \stdClass();
$options->base = $_GET['url'];

$debug = isset($_GET['debug']) ? (boolean)$_GET['debug'] : false;
$frame = isset($_GET['vocab']) ? (boolean)$_GET['vocab'] : false;

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

$frameApiDocumentation = function($document)
{
  if (0 === strlen(trim($document))) {
    return $document;
  }

  global $options;
  try
  {
    $frame = '
{
  "@context": {
    "hydra": "http://purl.org/hydra/core#",
    "ApiDocumentation": "hydra:ApiDocumentation",
    "property": { "@id": "hydra:property", "@type": "@id" },
    "readonly": "hydra:readonly",
    "writeonly": "hydra:writeonly",
    "supportedClasses": "hydra:supportedClasses",
    "supportedProperties": { "@id": "hydra:supportedProperties", "@container": "@set" },
    "supportedOperations": { "@id": "hydra:supportedOperations", "@container": "@set" },
    "method": "hydra:method",
    "expects": { "@id": "hydra:expects", "@type": "@id" },
    "returns": { "@id": "hydra:returns", "@type": "@id" },
    "statusCodes": { "@id": "hydra:statusCodes", "@container": "@set" },
    "code": "hydra:statusCode",
    "rdfs": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "label": "rdfs:label",
    "description": "rdfs:comment",
    "domain": { "@id": "rdfs:domain", "@type": "@id" },
    "range": { "@id": "rdfs:range", "@type": "@id" }
  },
  "@embedChildren": false,
  "supportedProperties": {
    "@default": [ ],
    "@embed": true
  },
  "supportedOperations": {
    "@default": [ ],
    "@embed": true,
    "expects": { "@default": null, "@embed": false },
    "statusCodes": { "@default": [], "@embed": true }
  }
}
    ';

    $document = JsonLD::frame(JsonLD::expand($document, $options), $frame);
    //unset($document->{'@graph'}[0]);

    $result = JsonLD::toString($document);

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
} elseif ($frame) {
  $proxy->setResponseModifier($frameApiDocumentation);

}

$proxy->execute();
