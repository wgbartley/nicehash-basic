var CryptoJS = require('crypto-js');
var axios = require('axios');
var qs = require('qs');


function createNonce() {
	var s = '', length = 32;
	do {
		s += Math.random().toString(36).substr(2);
	} while (s.length < length);
	s = s.substr(0, length);
	return s;
}

module.exports = function(locale, apiHost, apiKey, apiSecret, orgId) {
	var _this = this;

	this.init = function(locale, apiHost, apiKey, apiSecret, orgId) {
		if(typeof orgId=='undefined')
			orgId = '';

		this.locale = locale || 'en';
		this.host = apiHost;
		this.key = apiKey;
		this.secret = apiSecret;
		this.org = orgId;
		this.localTimeDiff = null;
	}


	this.getAuthHeader = function(ts, nonce, request) {
		var hmac = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA256, _this.secret);

		hmac.update(_this.key);
		hmac.update("\0");
		hmac.update(ts);
		hmac.update("\0");
		hmac.update(nonce);
		hmac.update("\0");
		hmac.update("\0");

		if(_this.org) hmac.update(_this.org);
			hmac.update("\0");

		hmac.update("\0");
		hmac.update(request.method);
		hmac.update("\0");
		hmac.update(request.path);
		hmac.update("\0");

		if (request.query) hmac.update(typeof request.query == 'object' ? qs.stringify(request.query) : request.query);

		if (request.body) {
			hmac.update("\0");
			hmac.update(typeof request.body == 'object' ? JSON.stringify(request.body) : request.body);
		}

		return _this.key + ':' + hmac.finalize().toString(CryptoJS.enc.Hex);
	}


	this.getTime = function(callback) {
		axios.get(`${this.host}/api/v2/time`, {responseType:'json'})
			.then(function(res) {
				this.localTimeDiff = res.data.serverTime - (+new Date());
				this.time = res.data.serverTime;

				if(!!callback)
					callback();

				return res;
			});
	}


	this.call = function(method, path, query, body, callback) {
		if(typeof callback!='function' && typeof body=='function') {
			callback = body;
			body = undefined;
		}

		if(typeof callback!='function' && typeof query=='function') {
			callback = query;
			query = undefined;
		}

		if(typeof callback!='function' && typeof path=='function') {
			callback = path;
			path = undefined;
		}

		if(this.localTimeDiff === null)
			_this.getTime(_call);
		else
			_call();

		function _call() {
			var nonce = createNonce();
			var ts = (_this.time || (+new Date() + _this.localTimeDiff)).toString();

			var [path_only, path_query] = path.split('?');
			if(path_query)
				query = {...qs.parse(path_query), ...query};

			var opts = {
				baseURL: _this.host,
				url: path_only,
				method: method,
				headers: {
					'X-Request-Id': nonce,
					'X-User-Agent': 'Node.JS Convenience Miner',
					'X-Time': ts,
					'X-Nonce': nonce,
					'X-User-Lang': _this.locale,
					'X-Organization-Id': _this.org,
					'X-Auth': getAuthHeader(ts, nonce, {
						method: method,
						path: path_only,
						query: query,
						body: body
					})
				},
				params: query,
				data: body,
				json:true
			};

			var r_data, r_err, r_response;
			axios(opts).then(function(response) {
				r_data = JSON.parse(JSON.stringify(response.data));
				r_response = response;
				delete r_response.data;
			}).catch(function(response) {
				r_err = {
					status: response.response.status,
					statusText: response.response.statusText,
					headers: response.response.headers,
					config: response.response.config
				};

				r_response = response;
			}).then(function() {
				if(!!callback)
					return callback(r_err, r_data, r_response);
			});
		}
	}

	this.get = function(path, query, body, callback) {
		_this.call('GET', path, query, body, callback);
	}

	this.post = function(path, query, body, callback) {
		_this.call('POST', path, query, body, callback);
	}

	this.put = function(path, query, body, callback) {
		_this.call('PUT', path, query, body, callback);
	}

	this.delete = function(path, query, body, callback) {
		_this.call('DELETE', path, query, body, callback);
	}

	this.locations = {
		0: ['eu', 'Europe', 'EU', 'EU_N'],
		1: ['usa', 'USA', 'USA', 'USA_E'],
		2: ['eu-west', 'Europe - West', 'EU'],
		3: ['eu-north', 'Europe - North', 'EU_N'],
		4: ['usa-west', 'USA - West', 'USA'],
		5: ['usa-east', 'USA - East', 'USA_E']
	}

	this.init(locale, apiHost, apiKey, apiSecret, orgId);

	return this;
}
