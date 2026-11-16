// Execute the actual Terraform-rendered function with a public synthetic token.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = JSON.parse(JSON.parse(fs.readFileSync(process.argv[2], 'utf8')));
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const token = 'a'.repeat(64);
function request(overrides = {}) {
  return {uri: '/api/health', headers: {host: {value:'chapatuchoro.com'}, 'x-ctc-origin-token': {value:token}, 'cf-connecting-ip': {value:'203.0.113.9'}, 'x-ctc-client-ip': {value:'spoofed'}, ...overrides}};
}
for (const headers of [ {'x-ctc-origin-token':undefined}, {'x-ctc-origin-token':{value:'wrong'}}, {'x-ctc-origin-token':{value:token,multiValue:[{value:token}]}}, {'cf-connecting-ip':undefined}, {host:{value:'example.cloudfront.net'}} ]) {
  assert.equal(sandbox.handler({request:request(headers)}).statusCode,403);
}
const good=sandbox.handler({request:request()});
assert.equal(good.headers['x-ctc-client-ip'].value,'203.0.113.9');
assert.equal(good.headers['x-ctc-origin-token'],undefined);
const www=request({host:{value:'www.chapatuchoro.com'}});
www.uri='/tendencias';www.querystring={q:{value:'Lima Callao'}};
assert.equal(sandbox.handler({request:www}).headers.location.value,'https://chapatuchoro.com/tendencias?q=Lima%20Callao');
assert.ok(Buffer.byteLength(code)<=10000);
console.log('Cloudflare gate: missing/wrong/duplicate proof, missing IP and direct origin rejected; verified identity, token stripping, redirects and size passed.');
