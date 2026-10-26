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
const {criarRevisaoLinksComprovantes}=require('../functions/finance-attachment-legacy-links');
(async()=>{const app=initializeApp({projectId,storageBucket:projectId+'.appspot.com'});
 try{const tenantId=process.argv.find(arg=>arg.startsWith('--empresa='))?.slice(10),pagina=process.argv.find(arg=>arg.startsWith('--pagina='))?.slice(9);const result=await criarRevisaoLinksComprovantes({bucket:getStorage(app).bucket()}).executar({tenantId,pagina,aplicar:process.argv.includes('--aplicar')});console.log(JSON.stringify(result,null,2));}
 finally{await deleteApp(app);}
})().catch(error=>{console.error(error.message);process.exitCode=1;});
