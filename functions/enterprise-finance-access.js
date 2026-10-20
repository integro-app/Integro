"use strict";
function sources(user={}) { return [user.permissoesCargo,user.permissoes,user.permissoesUsuario].filter(p=>p&&typeof p==='object'); }
function denied(user,actions=[]) {return sources(user).some(p=>p.controleFinanceiro===false || p.controleFinanceiro?.ver===false || p['controleFinanceiro.ver']===false || actions.some(action=>p.controleFinanceiro?.[action]===false || p['controleFinanceiro.'+action]===false));}
module.exports={sources,denied};
