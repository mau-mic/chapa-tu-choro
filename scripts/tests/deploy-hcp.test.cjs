const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
for (const scenario of ['applied', 'planned_and_finished', 'errored', 'local']) {
  test(`remote deployment: ${scenario}`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hcp-test-'));
    try {
      for (const dir of ['scripts', 'infra/terraform', 'dist', 'frontend/dist', 'bin']) fs.mkdirSync(path.join(root, dir), {recursive: true});
      fs.copyFileSync(path.join(__dirname, '../deploy-hcp.sh'), path.join(root, 'scripts/deploy-hcp.sh'));
      for (const name of ['dist/api.zip', 'dist/ingestion.zip', 'frontend/dist/cloudfront-router.js', 'infra/terraform/main.tf']) fs.writeFileSync(path.join(root,name), 'fixture');
      fs.writeFileSync(path.join(root,'infra/terraform/secret.tfvars'), 'must not upload');
      fs.writeFileSync(path.join(root,'bin/curl'), `#!/usr/bin/env node
const fs=require('fs'); const {execFileSync}=require('child_process');
const args=process.argv.slice(2); const url=args.find(x=>x.startsWith('https://'));
let data;
if(url.endsWith('/workspaces/test')) data={id:'ws-test',attributes:{'execution-mode':process.env.SCENARIO==='local'?'local':'remote','working-directory':'infra/terraform'}};
else if(url.endsWith('/configuration-versions')) data={id:'cv-test',attributes:{'upload-url':'https://upload.example/archive'}};
else if(url.includes('upload.example')) {
 if(args.some(x=>x.includes('Bearer'))) process.exit(3);
 const file=args[args.indexOf('--data-binary')+1].slice(1);
 const files=execFileSync('tar',['-tzf',file],{encoding:'utf8'});
 if(files.includes('secret')||!files.includes('dist/api.zip')) process.exit(4);
 process.exit(0);
}
else if(url.endsWith('/configuration-versions/cv-test')) data={attributes:{status:'uploaded'}};
else if(url.endsWith('/runs')) {const body=JSON.parse(args[args.indexOf('--data')+1]);if(!body.data.attributes['auto-apply'])process.exit(5);data={id:'run-test'};}
else if(url.endsWith('/runs/run-test')) data={attributes:{status:process.env.SCENARIO}};
else if(url.endsWith('/current-state-version')) data={id:'sv-test'};
else if(url.endsWith('/outputs')) data=['site_bucket','cloudfront_distribution_id','cloudfront_url'].map(name=>({attributes:{name,value:'fixture-'+name,sensitive:false}}));
else process.exit(6);
console.log(JSON.stringify({data}));
`, {mode:0o755});
      const output=path.join(root,'out');
      const run=spawnSync('bash',[path.join(root,'scripts/deploy-hcp.sh')],{encoding:'utf8',env:{...process.env,PATH:path.join(root,'bin')+':'+process.env.PATH,HCP_TOKEN:'test-token',HCP_ORGANIZATION:'test',HCP_WORKSPACE:'test',SCENARIO:scenario,GITHUB_OUTPUT:output}});
      if(['applied','planned_and_finished'].includes(scenario)) {
        assert.equal(run.status,0,run.stderr);
        assert.match(fs.readFileSync(output,'utf8'),/cloudfront_distribution_id=fixture/);
      } else {assert.notEqual(run.status,0);assert.equal(fs.existsSync(output),false);}
      assert.equal(run.stdout.includes('test-token'),false);
    } finally {fs.rmSync(root,{recursive:true,force:true});}
  });
}
