'use strict';
const {spawnSync}=require('node:child_process');
const result=spawnSync(process.execPath,['--test','--test-name-pattern=indicacoes|clientes:|Empresa|assinatura|Master','tests/firestore-rules.test.js'],{stdio:'inherit',windowsHide:true});
process.exitCode=result.status||0;
