(function(scope){'use strict';
const labels={hr:'HR',sbp:'收缩压',dbp:'舒张压',spo:'SpO₂',et:'EtCO₂',temp:'核心温',rr:'RR'};
function parse(raw,title='导入病例'){
 if(typeof raw!=='string'||!raw.trim()||raw.length>60000)throw Error('请粘贴1—60000字的去标识化病例文本');
 if(/(?:姓名|身份证号|住院号|联系电话)\s*[:：]\s*[\p{L}\d]{2,}/u.test(raw))throw Error('检测到身份信息字段，请先删除姓名、证件号、住院号或联系电话');
 const lines=raw.replace(/\r/g,'').split('\n'),groups=[];let group=null;
 for(const line of lines){const heading=line.match(/^\s*(?:#{1,4}\s*)?(?:【\s*)?(?:阶段|场景|事件|节点)\s*[一二三四五六七八九十\d]+\s*[:：、.．]?\s*(.*?)\s*】?\s*$/);if(heading){group={title:line.replace(/[【】#]/g,'').trim().slice(0,100),lines:[]};groups.push(group);}else if(line.trim()){if(!group){group={title:'病例资料',lines:[]};groups.push(group);}group.lines.push(line);}}
 if(groups.length>40)throw Error('最多识别40个阶段，请精简病例');
 const warnings=[],events=groups.map((g,i)=>{
 const original=g.lines.join('\n');if(original.length>3900)throw Error('单阶段原文超过3900字，请按“阶段一：名称”拆分');
 const s=original.normalize('NFKC'),v={perf:1,wide:0},evidence={},issues=[];
 const patterns={hr:/(?:\bHR(?![a-z])|心率)\s*[:=为约]?\s*(\d+(?:\.\d+)?)/gi,spo:/(?:\bSpO2(?![a-z])|(?:脉搏)?(?:血氧|氧)饱和度)\s*[:=为约]?\s*(\d+(?:\.\d+)?)/gi,et:/(?:\bEtCO2(?![a-z])|呼气末(?:二氧化碳|CO2)|呼末(?:二氧化碳|CO2))\s*[:=为约]?\s*(\d+(?:\.\d+)?)/gi,temp:/(?:核心(?:体)?温(?:度)?)\s*[:=为约]?\s*(\d+(?:\.\d+)?)/gi,rr:/(?:\bRR(?![a-z])|呼吸频率)\s*[:=为约]?\s*(\d+(?:\.\d+)?)/gi};
 for(const[k,re]of Object.entries(patterns)){const matches=[...s.matchAll(re)],nums=[...new Set(matches.map(m=>Number(m[1])))];v[k]=nums.length===1?nums[0]:null;evidence[k]=matches.map(m=>m[0]);if(matches.some(m=>/^\s*(?:→|->|至|到|下降至|上升至|[-~～—])\s*\d/.test(s.slice(m.index+m[0].length)))){v[k]=null;issues.push(labels[k]+'包含趋势或范围，请拆分节点');}if(nums.length>1)issues.push(labels[k]+'出现多个数值，未自动选取');if(matches.some(m=>/^\s*(?:kPa|°F)/i.test(s.slice(m.index+m[0].length)))){v[k]=null;issues.push(labels[k]+'单位需要人工换算');}}
 const bps=[...s.matchAll(/(?:\b(?:NIBP|ART|ABP|BP)(?![a-z])|血压)\s*[:=为约]?\s*(\d+)\s*\/\s*(\d+)/gi)],pairs=[...new Set(bps.map(m=>m[1]+'/'+m[2]))];v.sbp=pairs.length===1?Number(pairs[0].split('/')[0]):null;v.dbp=pairs.length===1?Number(pairs[0].split('/')[1]):null;evidence.bp=bps.map(m=>m[0]);if(pairs.length>1)issues.push('血压出现多个数值，需拆分阶段');if(bps.some(m=>/^\s*kPa/i.test(s.slice(m.index+m[0].length)))){v.sbp=v.dbp=null;issues.push('血压单位需要人工换算');}
 for(const[k,label]of Object.entries(labels)){const range=scope.MonitorModel?.fields[k];if(v[k]!==null&&range&&(v[k]<range[0]||v[k]>range[1])){v[k]=null;issues.push(label+'超出工作台范围');}if(v[k]===null)issues.push(label+'缺失或待确认');}
 const lost=/(?:SpO2|(?:血氧|氧)饱和度)[^。；;\n]{0,12}(?:测不出|无法(?:显示|测出)|无读数|无信号)/i.test(s),noCo2=/(?:EtCO2|呼气末二氧化碳|CO2)[^。；;\n]{0,12}(?:无波形|波形消失|未监测)/i.test(s),unmonitored=/(?:EtCO2|呼气末二氧化碳|CO2)[^。；;\n]{0,12}未监测/i.test(s);
 const durationMatch=s.match(/(?:过渡时间|变化时间|动画时间)\s*[:=为]?\s*(\d+(?:\.\d+)?)\s*(秒|s|分钟|min)/i);let duration=durationMatch?Number(durationMatch[1])*(/分钟|min/i.test(durationMatch[2])?60:1):0;if(duration>3600){duration=0;issues.push('过渡时间超出范围，暂设0秒');}if(!durationMatch)issues.push('未指定过渡时间，暂设0秒，需导师编排');
 issues.push('波幅系数1、普通ECG、袖带模式及监测开关为编辑初值，需导师核对');warnings.push(...issues.map(x=>(i+1)+'. '+x));
 return {title:g.title,time:'',hint:'导入草案：先核对数值与监测状态',brief:original,recognitionStart:false,actions:[],cards:[{text:'导入资料待编排；检验结果请加入后续结果卡并设置释放节点。',minNode:0}],nodes:[{label:g.title,v,duration,curve:'smooth',bpMode:'nibp',bpFirst:8,bpInterval:30,co2:!noCo2,co2Expected:!unmonitored,co2Instant:false,spoValid:!lost,tempOn:v.temp!==null,tempMode:'interpolate',autoNext:false,nextOnAction:'',vent:'待导师核对',provenance:JSON.stringify(evidence).slice(0,1000),ranges:{}}]};});
 return {warnings,caseData:{schemaVersion:1,id:'text-'+Date.now(),title:title.trim().slice(0,100)||'导入病例',patient:'去标识化教学病例；原文见各阶段说明',version:'0.2-text-draft',reviewStatus:'draft',sources:'来源：用户粘贴或文本文件。解析器：local-explicit-v1。仅识别明确标记的参数；原文保留在阶段说明。数值核对不等同医学审核。',notes:'本地规则识别；不自动推断诊断、用药、报警阈值或处置分支。',base:{hr:70,sbp:120,dbp:80,spo:98,temp:37,et:35,rr:12,perf:1,wide:0},settings:{variation:false},events,alarmRules:[]}};
}
scope.CaseTextImporter={parse,labels};if(typeof module!=='undefined')module.exports=scope.CaseTextImporter;
})(typeof window!=='undefined'?window:globalThis);
