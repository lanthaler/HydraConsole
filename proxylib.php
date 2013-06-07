<?php
/**
 *
 * LICENSE
 *
 * This source file is subject to the new BSD license that is bundled
 * with this package in the file LICENSE.txt.
 *
 * FILE DOCUMENTATION
 *
 * More extensive documentation is located in README.markdown, which is
 *  contained in this package.
 *
 * This file contains a class and script to execute a proxy requests from AJAX
 *  scripts. If this file was live on a server at example.com/proxy.php, and we
 *  wanted to make AJAX requests to subdomain.example.com/other/resource, we'd:
 *      1. Add lines at the bottom of this file to say
 *          $proxy = new AjaxProxy('http://subdomain.example.com');
 *          $proxy->execute();
 *      2. From our javascript, make requests to
 *          http://example.com/proxy.php?url=/other/resource
 * The heart of the functionality of this script is self-contained, reusable
 *  proxy class. This class could very easily be incorporated into an MVC
 *  framework or set of libraries.
 *
 * @todo Finalize licensing above
 * @package IceCube
 * @copyright Copyright (c) 2010 HUGE LLC (http://hugeinc.com)
 * @license New BSD License
 * @author Kenny Katzgrau <kkatzgrau@hugeinc.com>
 * @version 1.0.0
 */

/**
 * This class handles all of the functionality of the proxy server. The only
 *  public method is AjaxProxy::execute(), so once the class is constructed, the
 *  only option is to execute the proxy request. It will throw exceptions when
 *  something isn't right, the message of which will be dumped to the output
 *  stream.
 *
 * There is an option to restrict requests so that they can only be made from
 *  certain hostnames or ips in the constructor
 *
 * @author Kenny Katzgrau <kkatzgrau@hugeinc.com>
 */
class AjaxProxy
{
    /**
     * Will hold the hostname or IP address of the machin allowed to access this
     *  proxy
     * @var string
     */
    protected $_allowedHostnames  = NULL;

    /**
     * Will hold the host where proxy requests will be forwarded to
     * @var string
     */
    protected $_forwardHost       = NULL;

    /**
     * Will hold the HTTP request method of the proxy request
     * @var string
     */
    protected $_requestMethod     = NULL;

    /**
     * Will hold the cookies submitted by the client for the proxy request
     * @var string
     */
    protected $_requestCookies    = NULL;

    /**
     * Will hold the request Authorization header
     */
    protected $_requestAuthorization = NULL;

    /**
     * Will hold the request Accept header
     */
    protected $_requestAccept = NULL;

    /**
     * Will hold the body of the request submitted by the client
     * @var string
     */
    protected $_requestBody       = NULL;

    /**
     * Will hold the content type of the request submitted by the client
     * @var string
     */
    protected $_requestContentType= NULL;

    /**
     * Will hold the user-agent string submitted by the client
     * @var string
     */
    protected $_requestUserAgent  = NULL;

    /**
     * Will hold the raw HTTP response (headers and all) sent back by the server
     *  that the proxy request was made to
     * @var string
     */
    protected $_rawResponse       = NULL;

    /**
     * Will hold the response body sent back by the server that the proxy
     *  request was made to
     * @var string
     */
    protected $_responseBody      = NULL;

    /**
     * Will hold parsed HTTP headers sent back by the server that the proxy
     *  request was made to in key-value form
     * @var array
     */
    protected $_responseHeaders   = NULL;

    /**
     * Will hold headers in key-value array form that were sent by the client
     * @var array
     */
    protected $_rawHeaders        = NULL;

    /**
     * Will hold the url for the proxy request submitted by the client in
     *  the query string's 'url' parameter
     * @var string
     */
    protected $_url             = NULL;


    protected $_responseModifier = NULL;

    /**
     * Initializes the Proxy object
     *
     * @param string $forward_host The base address that all requests will be
     *  forwarded to. Must not end in a trailing slash.
     *
     * @param string|array $allowed_hostname If you want to restrict proxy
     *  requests to only come from a certain hostname or IP, you can supply
     *  a single hostname as a string, or an array of hostnames.
     *
     * @param bool $handle_errors This should be true if you want this class to
     *  catch and handle it's own errors and exception. This makes sense if you
     *  are using this class as a standalone script. If you are using it in a
     *  larger application with it's own error and exception handling, you
     *  should set this to false, or it will override your settings.
     */
    public function  __construct(   $forward_host      = NULL,
                                    $allowed_hostnames = NULL,
                                    $handle_errors     = TRUE)
    {
        $this->_forwardHost = $forward_host;

        if($allowed_hostnames !== NULL)
        {
            if(is_array($allowed_hostnames))
                $this->_allowedHostnames = $allowed_hostnames;
            else
                $this->_allowedHostnames = array($allowed_hostnames);
        }

        if($handle_errors)
            $this->_setErrorHandlers();
    }

    public function setResponseModifier($responseModifier)
    {
        $this->_responseModifier = $responseModifier;
    }

    /**
     * Execute the proxy request. This method sets HTTP headers and write to the
     *  output stream. Make sure that no whitespace or headers have already been
     *  sent.
     */
    public function execute()
    {
            $this->_checkPermissions();
            $this->_gatherRequestInfo();
            $this->_makeRequest();
            $this->_parseResponse();
            $this->_buildAndExecuteProxyResponse();
    }

    /**
     * Gather any information we need about the request and
     *  store them in the class properties
     */
    protected function _gatherRequestInfo()
    {
        $this->_loadRequestMethod();
        $this->_loadRequestCookies();
        $this->_loadRequestUserAgent();
        $this->_loadRequestAuthorizationHeader();
        $this->_loadRequestAcceptHeader();
        $this->_loadRawHeaders();
        $this->_loadContentType();
        $this->_loadUrl();

        if($this->_requestMethod === 'POST'
            || $this->_requestMethod === 'PUT')
        {
            $this->_loadRequestBody();
        }
    }

    /**
     * Get the url to where the request will be made.
     *
     * @throws Exception When there is no 'url' parameter
     */
    protected function _loadUrl()
    {
        if(!key_exists('url', $_GET))
            throw new Exception("You must supply a 'url' parameter in the request");

        $this->_url = ($this->_forwardHost)
            ? $this->_forwardHost . $_GET['url']
            : $_GET['url'];
    }

    /**
     * Get the request body raw from the PHP input stream and store it in the
     *  _requestBody property.
     *
     * There have been concerns with blindly reading the entirety of an input
     *  stream with no maximum length, but this is limited with the maximum
     *  request size in php.ini. Additionally, Zend_Amf_Request_Http does the
     *  same.
     *
     */
    protected function _loadRequestBody()
    {
        $this->_requestBody = @file_get_contents('php://input');
    }

    /**
     * Examine the request and load the HTTP request method
     *  into the _requestMethod property
     * @throws Exception When there is no request method
     */
    protected function _loadRequestMethod()
    {
        if($this->_requestMethod !== NULL) return;

        if(!key_exists('REQUEST_METHOD', $_SERVER)) {
            throw new Exception("Request method unknown");
        }

        $method = strtoupper($_SERVER['REQUEST_METHOD']);

        if (in_array($method, array('GET', 'POST', 'PUT', 'DELETE', 'PATCH'))) {
            $this->_requestMethod = $method;
        } else {
            throw new Exception("Request method ($method) invalid");
        }
    }

    /**
     * Loads the user-agent string into the _requestUserAgent property
     * @throws Exception When the user agent is not sent by the client
     */
    protected function _loadRequestUserAgent()
    {
        if($this->_requestUserAgent !== NULL) return;

        if(! key_exists('HTTP_USER_AGENT', $_SERVER))
            throw new Exception("No HTTP User Agent was found");

        $this->_requestUserAgent = $_SERVER['HTTP_USER_AGENT'];
    }

    /**
     * Store the cookie array into the _requestCookies
     *  property
     */
    protected function _loadRequestCookies()
    {
        if($this->_requestCookies !== NULL) return;

        $this->_requestCookies = $_COOKIE;
    }

    /**
     * Store the Authorization header in _requestAuthorization
     *  property
     */
    protected function _loadRequestAuthorizationHeader()
    {
        if($this->_requestAuthorization !== NULL) return;

        $this->_loadRawHeaders();

        if (key_exists('Authorization', $this->_rawHeaders)) {
            $this->_requestAuthorization = $this->_rawHeaders['Authorization'];
        }
    }

    /**
     * Store the Accept header in _requestAccept property
     */
    protected function _loadRequestAcceptHeader()
    {
        if($this->_requestAccept !== NULL) return;

        $this->_loadRawHeaders();

        if (key_exists('Accept', $this->_rawHeaders)) {
            $this->_requestAccept = $this->_rawHeaders['Accept'];
        }
    }

    /**
     * Load the content type into the _requestContentType property
     */
    protected function _loadContentType()
    {
        $this->_loadRawHeaders();

        if(key_exists('Content-Type', $this->_rawHeaders))
            $this->_requestContentType = $this->_rawHeaders['Content-Type'];
    }

    /**
     * Load raw headers into the _rawHeaders property.
     *  This method REQUIRES APACHE
     * @throws Exception When we can't load request headers (perhaps when Apache
     *  isn't being used)
     */
    protected function _loadRawHeaders()
    {
        if($this->_rawHeaders !== NULL) return;

        $this->_rawHeaders = apache_request_headers();

        if($this->_rawHeaders === FALSE)
            throw new Exception("Could not get request headers");
    }

    /**
     * Check that the proxy request is coming from the appropriate host
     *  that was set in the second argument of the constructor
     * @return void
     * @throws Exception when a client hostname is not permitted on a request
     */
    protected function _checkPermissions()
    {
        if($this->_allowedHostnames === NULL)
            return;

        if(key_exists('REMOTE_HOST', $_SERVER))
            $host = $_SERVER['REMOTE_HOST'];
        else
            $host = $_SERVER['REMOTE_ADDR'];

        if(!in_array($host, $this->_allowedHostnames))
            throw new Exception("Requests from hostname ($host) are not allowed");
    }

    /**
     * Make the proxy request using the supplied route and the base host we got
     *  in the constructor. Store the response in _rawResponse
     */
    protected function _makeRequest()
    {
        # Check for cURL. If it isn't loaded, fall back to fopen()
        if(function_exists('curl_init'))
            $this->_rawResponse = $this->_makeCurlRequest($this->_url);
        else
            $this->_rawResponse = $this->_makeFOpenRequest($this->_url);
    }

    /**
     * Given the object's current settings, make a request to the given url
     *  using the cURL library
     * @param string $url The url to make the request to
     * @return string The full HTTP response
     */
    protected function _makeCurlRequest($url)
    {
        $curl_handle = curl_init($url);

        curl_setopt($curl_handle, CURLOPT_CUSTOMREQUEST, $this->_requestMethod);
        if($this->_requestBody)
        {
            curl_setopt($curl_handle, CURLOPT_POSTFIELDS, $this->_requestBody);
        }

        curl_setopt($curl_handle, CURLOPT_HEADER, true);
        curl_setopt($curl_handle, CURLOPT_USERAGENT, $this->_requestUserAgent);
        curl_setopt($curl_handle, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($curl_handle, CURLOPT_COOKIE, $this->_buildProxyRequestCookieString());
        curl_setopt($curl_handle, CURLOPT_HTTPHEADER, $this->_generateProxyRequestHeaders());

        $response = curl_exec($curl_handle);

        if (false === $response) {
            var_dump(curl_error($curl_handle));
        } else {
            return $response;
        }
    }

    /**
     * Given the object's current settings, make a request to the supplied url
     *  using PHP's native, less speedy, fopen functions
     * @param string $url The url to make the request to
     * @return string The full HTTP response
     */
    protected function _makeFOpenRequest($url)
    {
        $context      = $this->_buildFOpenStreamContext();
        $file_pointer = @fopen($url, 'r', null, $context);

        if(!$file_pointer)
            throw new Exception("There was an error making the request. Make sure that the url is valid, and either fopen or cURL are available.");

        $meta    = stream_get_meta_data($file_pointer);
        $headers = $this->_buildResponseHeaderFromMeta($meta);
        $content = stream_get_contents($file_pointer);

        fclose($file_pointer);

        return "$headers\r\n\r\n$content";
    }

    /**
     * Given an associative array returned by PHP's methods to get stream meta,
     *  extract the HTTP response header from it
     * @param array $meta The associative array contianing stream information
     * @return array
     */
    protected function _buildResponseHeaderFromMeta($meta)
    {
        if(! array_key_exists('wrapper_data', $meta))
            throw new Exception("Did not receive a valid response from the server");

        $headers = $meta['wrapper_data'];

        /**
         * When using stream_context_create, if the socket is redirected via a
         *  302, PHP just adds the 302 headers onto the wrapper_data array
         *  in addition to the headers from the redirected page. We only
         *  want the redirected page's headers.
         */
        $last_status = 0;
        for($i = 0; $i < count($headers); $i++)
        {
            if(strpos($headers[$i], 'HTTP/') === 0)
            {
                $last_status = $i;
            }
        }

        # Get the applicable portion of the headers
        $headers = array_slice($headers, $last_status);

        return implode("\n", $headers);
    }

    /**
     * Given the object's current settings, build a context array for PHP's
     *  fopen() methods to work with
     * @return array The associative array containing context information
     */
    protected function _buildFOpenStreamContext()
    {
        # Set the headers required to work with fopen
        $headers =  $this->_generateProxyRequestHeaders(TRUE);
        $headers.= 'Cookie: ' . $this->_buildProxyRequestCookieString();

        # Create the stream context
        $stream_context = array (
            'header'        => $headers,
            'user_agent'    => $this->_requestUserAgent
        );

        # Figure out what kind of request we're making, and what to fill it with
        $stream_context['method'] = $this->_requestMethod;

        if($this->_requestMethod === 'POST' ||
           $this->_requestMethod === 'PUT')
        {
            $stream_context['content'] = $this->_requestBody;
        }

        return stream_context_create(array('http' => $stream_context));
    }

    /**
     * Parse the headers and the body out of the raw response sent back by the
     *  server. Store them in _responseHeaders and _responseBody.
     * @throws Exception When the server does not give us a valid response
     */
    protected function _parseResponse()
    {
        /**
         * According to the HTTP spec, we have to respect \n\n too
         *  @todo: Respect \n\n
         */
        $break_1 = strpos($this->_rawResponse, "\r\n\r\n");
        $break_2 = strpos($this->_rawResponse, "\n\n");
        $break   = 0;

        if    ($break_1 && $break_2 === FALSE) $break = $break_1;
        elseif($break_2 && $break_1 === FALSE) $break = $break_2;
        elseif($break_1 < $break_2) $break = $break_1;
        else $break = $break_2;

        # Let's check to see if we recieved a header but no body
        if($break === FALSE)
        {
            if(strpos($this->_rawResponse, 'HTTP/') !== FALSE)
            {
                $break = strlen($this->_rawResponse);
            }
            else
            {
                throw new Exception("A valid response was not received from the host");
            }
        }

        $header = substr($this->_rawResponse, 0, $break);
        $this->_responseHeaders = $this->_parseResponseHeaders($header);
        $this->_responseBody    = substr($this->_rawResponse, $break + 3);
    }

    /**
     * Parse out the headers from the response and store them in a key-value
     *  array and return it
     * @param string $headers A big chunk of text representing the HTTP headers
     * @return array A key-value array containing heder names and values
     */
    protected function _parseResponseHeaders($headers)
    {
        $headers = str_replace("\r", "", $headers);
        $headers = explode("\n", $headers);
        $parsed  = array();

        foreach($headers as $header)
        {
            $field_end = strpos($header, ':');

            if($field_end === FALSE)
            {
                /* Cover the case where we're at the first header, the HTTP
                 *  status header
                 */
                $field = 'status';
                $value = $header;
            }
            else
            {
                $field = substr($header, 0, $field_end);
                $value = substr($header, $field_end + 1);
            }

            $parsed[$field] = $value;
        }

        return $parsed;
    }

    /**
     * Generate and return any headers needed to make the proxy request
     * @param  bool $as_string Whether to return the headers as a string instead
     *  of an associative array
     * @return array|string
     */
    protected function _generateProxyRequestHeaders($as_string = FALSE)
    {
        $headers = array();
        $headers[] = 'Content-Type: ' . $this->_requestContentType;

        if ($this->_requestAuthorization) {
            $headers[] = 'Authorization: ' . $this->_requestAuthorization;
        }

        if ($this->_requestAccept) {
            $headers[] = 'Accept: ' . $this->_requestAccept;
        }

        if($as_string)
        {
            $data = "";
            foreach($headers as $value)
                if($value)
                    $data .= "$value\n";

            $headers = $data;
        }

        return $headers;
    }

    /**
     * From the global $_COOKIE array, rebuild the cookie string for the proxy
     *  request
     * @return string
     */
    protected function _buildProxyRequestCookieString()
    {
        $cookie_string  = '';

        if(key_exists('Cookie', $this->_rawHeaders))
            $cookie_string = $this->_rawHeaders['Cookie'];

        return $cookie_string;
    }

    /**
     * Generate headers to send back to the broswer/client based on what the
     *  server sent back
     */
    protected function _generateProxyResponseHeaders()
    {
        header($this->_responseHeaders['status']);

        // Let the server handle the Content-Lenght and Transfer-Encoding headers
        unset($this->_responseHeaders['Content-Length']);
        unset($this->_responseHeaders['Transfer-Encoding']);

        foreach($this->_responseHeaders as $name => $value)
        {
            if($name != 'status')
                header("$name: $value");
        }
    }

    /**
     * Generate the headers and send the final response to the output stream
     */
    protected function _buildAndExecuteProxyResponse()
    {
        if($this->_responseModifier)
        {
          $data = call_user_func_array($this->_responseModifier, array(&$this->_responseBody, &$this->_responseHeaders));
        }

        $this->_generateProxyResponseHeaders();

        $this->_output($this->_responseBody);
    }

    /**
     * A wrapper method for something like 'echo', simply to void having
     *  echo's in different parts of the code
     * @param mixed $data Data to dump to the output stream
     */
    protected function _output($data)
    {
        echo $data;
    }

    /**
     * Make it so that this class handles it's own errors. This means that
     *  it will register PHP error and exception handlers, and die() if there
     *  is a problem.
     */
    protected function _setErrorHandlers()
    {
        set_error_handler(array($this, 'handleError'));
        set_exception_handler(array($this, 'handleException'));
    }

    /**
     * A callback method for PHP's set_error_handler function. Used to handle
     *  application-wide errors
     * @param int       $code
     * @param string    $message
     * @param string    $file
     * @param int       $line
     */
    public function handleError($code, $message, $file, $line)
    {
        $this->_sendFatalError("Fatal proxy Error: '$message' in $file:$line");
    }

    /**
     * A callback method for PHP's set_exception_handler function. Used to
     *  handle application-wide exceptions.
     * @param Exception $exception The exception being thrown
     */
    public function handleException(Exception $exception)
    {
        $this->_sendFatalError("Fatal proxy Exception: '"
                               . $exception->getMessage()
                               . "' in "
                               . $exception->getFile()
                               . ":"
                               . $exception->getLine());
    }

    /**
     * Display a fatal error to the user. This will halt execution.
     * @param string $message
     */
    protected static function _sendFatalError($message)
    {
        header('HTTP/1.1 500 Internal Server Error');

        die($message);
    }
}

