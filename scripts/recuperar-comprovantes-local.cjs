'use strict';
// Somente emuladores: sem credenciais, agendamento ou publicação.
const projectId='demo-integro-download-http';
for(const [name,expected]of Object.entries({FIRESTORE_EMULATOR_HOST:'127.0.0.1:8080',FIREBASE_STORAGE_EMULATOR_HOST:'127.0.0.1:9199'})){
 if(process.env[name]&&process.env[name]!==expected)throw Error('Host local inesperado: '+name);
 process.env[name]=expected;
}
const {createRequire}=require('node:module'),path=require('node:path');
const req=createRequire(path.join(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore'),{getStorage}=req('firebase-admin/storage');
const {criarExclusaoComprovante}=require('../functions/finance-attachment-delete'),{criarRecuperacaoComprovantes}=require('../functions/finance-attachment-recovery');
(async()=>{const app=initializeApp({projectId,storageBucket:projectId+'.appspot.com'}),db=getFirestore(app),bucket=getStorage(app).bucket();
 try{const deleter=criarExclusaoComprovante({db,bucket,functions:{https:{HttpsError:class extends Error{constructor(code,message){super(message);this.code=code;}}}}}),recovery=criarRecuperacaoComprovantes({db,bucket,deleter});const aplicar=process.argv.includes('--aplicar'),cursor=process.argv.find(arg=>arg.startsWith('--cursor='))?.slice(9)||'',cursorLegadas=process.argv.find(arg=>arg.startsWith('--cursor-legadas='))?.slice(17)||'';
 const legadas=await recovery.registrarLegadas({aplicar,limite:20,cursor:cursorLegadas});
 const filas=await recovery.executar({aplicar,limite:20});
 const tentativas=await recovery.reconciliar({aplicar,limite:20,cursor});
 console.log(JSON.stringify({legadas,filas,tentativas},null,2));}
 finally{await db.terminate();await deleteApp(app);}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
