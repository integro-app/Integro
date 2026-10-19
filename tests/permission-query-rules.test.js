const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {collection,doc,getDoc,getDocs,query,where,limit,setDoc}=require('firebase/firestore');
let env;
const roles=['master_global','master_local','supervisor','gerente','vendedor','financeiro','administrativo'];
const owned={clientePlataformaId:'a',equipeId:'e1',vendedorAuthUid:'vendedor',vendedorId:'seller-doc',caixaId:'box'};
const types=['VENDA','PAGAMENTO','INGRESSO','GASTO','RETIRADA'];
const db=role=>env.authenticatedContext(role).firestore();
const readQuery=(role,name,filters)=>getDocs(query(collection(db(role),name),...filters.map(f=>where(...f)),limit(20)));
test.before(async()=>{
 env=await initializeTestEnvironment({projectId:'integro-permission-queries',firestore:{rules:fs.readFileSync(process.env.INTEGRO_RULES_FILE||path.join(__dirname,'../firestore.rules'),'utf8')}});
 await env.clearFirestore();
 await env.withSecurityRulesDisabled(async c=>{
  const admin=c.firestore();
  await setDoc(doc(admin,'clientes_integro','a'),{status:'ATIVO',acessoLiberado:true});
  await setDoc(doc(admin,'clientes_integro','b'),{status:'ATIVO',acessoLiberado:true});
  for(const role of [...roles,'blocked']) await setDoc(doc(admin,'usuarios',role),{authUid:role,id:role==='vendedor'?'seller-doc':role,clientePlataformaId:'a',tipoUsuario:['master_global','master_local'].includes(role)?role:'usuario_cliente',cargoChave:role,equipeId:'e1',equipesIds:['e1'],status:role==='blocked'?'BLOQUEADO':'ATIVO',acessoLiberado:true});
  for(const name of ['caixas','clientes_operacionais','vendas','parcelas','pagamentos','historicoCobrancas','solicitacoes','historico_estados_caixa']){
   await setDoc(doc(admin,name,'own'),owned);
   await setDoc(doc(admin,name,'foreign'),{...owned,clientePlataformaId:'b'});
  }
  await setDoc(doc(admin,'caixas','box'),owned);
  await setDoc(doc(admin,'caixas','conflict'),{...owned,vendedorAuthUid:'other'});
  for(const tipo of [...types,'ESTORNO']) await setDoc(doc(admin,'lancamentos_financeiros',tipo),{...owned,tipoLancamento:tipo});
  for(const role of roles) await setDoc(doc(admin,'notificacoes',role),{clientePlataformaId:'a',destinatarioAuthUid:role,tipo:'OPERACIONAL'});
 });
});
test.after(async()=>env?.cleanup());
test('notificações: query por destinatário sem tenant é negada; tenant + destinatário funciona',async()=>{
 for(const role of roles.filter(r=>r!=='master_global')){
  await assertFails(readQuery(role,'notificacoes',[['destinatarioAuthUid','==',role]]));
  await assertSucceeds(readQuery(role,'notificacoes',[['clientePlataformaId','==','a'],['destinatarioAuthUid','==',role]]));
  await assertFails(readQuery(role,'notificacoes',[['clientePlataformaId','==','b'],['destinatarioAuthUid','==',role]]));
 }
 await assertFails(getDoc(doc(db('master_global'),'notificacoes','master_global')));
});
test('ledger: vínculo próprio exige filtro dos tipos autorizados, inclusive consulta por caixa',async()=>{
 for(const owner of [['vendedorAuthUid','==','vendedor'],['caixaId','==','box']]){
  await assertFails(readQuery('vendedor','lancamentos_financeiros',[['clientePlataformaId','==','a'],owner]));
  await assertSucceeds(readQuery('vendedor','lancamentos_financeiros',[['clientePlataformaId','==','a'],owner,['tipoLancamento','in',types]]));
 }
 await assertFails(readQuery('vendedor','lancamentos_financeiros',[['clientePlataformaId','==','a'],['vendedorAuthUid','==','vendedor'],['tipoLancamento','==','ESTORNO']]));
});
test('caixa: sondagem inexistente por GET é negada; query escopada retorna zero sem ampliar Rules',async()=>{
 await assertFails(getDoc(doc(db('vendedor'),'caixas','missing')));
 const result=await assertSucceeds(readQuery('vendedor','caixas',[['clientePlataformaId','==','a'],['vendedorAuthUid','==','vendedor'],['status','in',['ABERTO','REABERTO']]]));
 assert.equal(result.size,0);
 await assertFails(getDoc(doc(db('vendedor'),'caixas','conflict')));
 await assertFails(readQuery('vendedor','caixas',[['clientePlataformaId','==','a'],['vendedorId','==','seller-doc']]));
});
for(const role of roles.filter(r=>r!=='master_global')) test('isolamento e leitura operacional autorizada: '+role,async()=>{
 for(const name of ['caixas','clientes_operacionais','vendas','parcelas','pagamentos','historicoCobrancas','solicitacoes','historico_estados_caixa']){
  const scope=role==='vendedor'?[['vendedorAuthUid','==',role]]:role==='supervisor'?[['equipeId','==','e1']]:[];
  await assertSucceeds(readQuery(role,name,[['clientePlataformaId','==','a'],...scope]));
  await assertFails(readQuery(role,name,[['clientePlataformaId','==','b'],...scope]));
 }
});
test('usuário bloqueado não obtém dados nem com query corretamente escopada',async()=>{
 await assertFails(readQuery('blocked','caixas',[['clientePlataformaId','==','a'],['vendedorAuthUid','==','blocked']]));
});

test('Master Global administra empresas, mas não atravessa tenant em dados operacionais do SDK',async()=>{
 await assertSucceeds(getDoc(doc(db('master_global'),'clientes_integro','b')));
 for(const name of ['caixas','clientes_operacionais','vendas','parcelas','pagamentos','solicitacoes','historicoCobrancas']){
  await assertFails(getDoc(doc(db('master_global'),name,'foreign')));
  await assertFails(readQuery('master_global',name,[['clientePlataformaId','==','b']]));
 }
});
