<?php

require('proxylib.php');
require('vendor/autoload.php');

ini_set('html_errors', 0);

use ML\IRI\IRI;
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

// Parse HTTP Link header to get referenced context
function parseContextLinkHeaders(array $values, IRI $baseIri)
{
  // Separate multiple links contained in a single header value
  for ($i = 0, $total = count($values); $i < $total; $i++) {
    if (strpos($values[$i], ',') !== false) {
      foreach (preg_split('/,(?=([^"]*"[^"]*")*[^"]*$)/', $values[$i]) as $v) {
        $values[] = trim($v);
      }
      unset($values[$i]);
    }
  }

  $contexts = $matches = array();
  $trimWhitespaceCallback = function ($str) {
    return trim($str, "\"'  \n\t");
  };

  // Split the header in key-value pairs
  foreach ($values as $val) {
    $part = array();
    foreach (preg_split('/;(?=([^"]*"[^"]*")*[^"]*$)/', $val) as $kvp) {
      preg_match_all('/<[^>]+>|[^=]+/', $kvp, $matches);
      $pieces = array_map($trimWhitespaceCallback, $matches[0]);
      $part[$pieces[0]] = isset($pieces[1]) ? $pieces[1] : '';
    }

    if (isset($part['rel']) && in_array('http://www.w3.org/ns/json-ld#context', explode(' ', $part['rel']))) {
      $contexts[] = (string) $baseIri->resolve(trim(key($part), '<> '));
    }
  }

  return array_values(array_unique($contexts));
}


$options = new \stdClass();
$options->base = $_GET['url'];

$debug = isset($_GET['debug']) ? (boolean)$_GET['debug'] : false;
$frame = isset($_GET['vocab']) ? (boolean)$_GET['vocab'] : false;

$debugExpansion = function(&$document, &$headers)
{
  if(isset($headers) && array_key_exists('Location', $headers)) {
    $_GET['url'] = trim($headers['Location']);
    $headers['Location'] = $_SERVER['SCRIPT_NAME'] . '?' . http_build_query($_GET);
  }

  $linkHeader = false;
  if (isset($headers['Link'])) {
    $linkHeader = parseContextLinkHeaders((array)$headers['Link'], new IRI($_GET['url']));

    $linkHeader = (count($linkHeader) === 1)
      ? reset($linkHeader)
      : false;
  }

  $passThrough =
    (0 === strlen(trim($document))) ||                     // if the body is empty (nothing to do)
    (false === isset($headers['Content-Type'])) ||         // not content type has been set
    (                                                     // or the content type is
      (false === strpos($headers['Content-Type'], 'application/ld+json')) &&  // neither application/ld+json
      !($linkHeader &&                                                        // nor a response with an HTTP Link header
        ((false !== strpos($headers['Content-Type'], 'application/json')) ||  // and a content type of application/json
         (false !== strpos($headers['Content-Type'], '+json')))               // or any +json content content type
      )
    );

  if ($passThrough) {
    return;
  }

  global $options;

  if ($linkHeader && (false === @strpos($headers['Content-Type'], 'application/ld+json'))) {
    $options->expandContext = $linkHeader;
  }

  try
  {
    $document = JsonLD::toString(JsonLD::expand($document, $options, true));
    $headers['Content-Type'] = 'application/ld+json';
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

$frameApiDocumentation = function(&$document, &$headers)
{
  if(isset($headers) && array_key_exists('Location', $headers)) {
    $_GET['url'] = trim($headers['Location']);
    $headers['Location'] = $_SERVER['SCRIPT_NAME'] . '?' . http_build_query($_GET);

    return;
  }

  if ((isset($headers['Content-Type']) && (false === strpos($headers['Content-Type'], 'application/ld+json'))) ||
    (0 === strlen(trim($document)))) {
    return;
  }

  global $options;
  try
  {
    $frame = '
{
  "@context": [
    {
      "hydra": "http://www.w3.org/ns/hydra/core#",
      "ApiDocumentation": "hydra:ApiDocumentation",
      "hydra:Class": "hydra:Class",
      "property": { "@id": "hydra:property", "@type": "@id" },
      "readonly": "hydra:readonly",
      "writeonly": "hydra:writeonly",
      "supportedClasses": "hydra:supportedClass",
      "supportedProperties": { "@id": "hydra:supportedProperty", "@container": "@set" },
      "supportedOperations": { "@id": "hydra:supportedOperation", "@container": "@set" },
      "method": "hydra:method",
      "expects": { "@id": "hydra:expects", "@type": "@id" },
      "returns": { "@id": "hydra:returns", "@type": "@id" },
      "statusCodes": { "@id": "hydra:statusCodes", "@container": "@set" },
      "code": "hydra:statusCode",
      "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
      "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
      "label": "rdfs:label",
      "description": "rdfs:comment",
      "hydra_title": "hydra:title",
      "hydra_description": "hydra:description",
      "domain": { "@id": "rdfs:domain", "@type": "@id" },
      "range": { "@id": "rdfs:range", "@type": "@id" }
    },
    {
      "hydra": null
    }
  ],
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

    $document = JsonLD::toString(
      JsonLD::frame(
        JsonLD::expand($document, $options),
        $frame
      )
    );
    $headers['Content-Type'] = 'application/ld+json';
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
