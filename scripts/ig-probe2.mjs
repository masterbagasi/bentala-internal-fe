import { Composio } from '@composio/core'
const c = new Composio({ apiKey: process.env.COMPOSIO_API_KEY, toolkitVersions: { instagram: '20260523_00' } })
const ctx = { userId: 'socmed:master-bagasi', connectedAccountId: 'ca_GUS6rXDlfSwX' }
const ex = (s,a)=>c.tools.execute(s,{...ctx,arguments:a})
const info = await ex('INSTAGRAM_GET_USER_INFO',{ig_user_id:'me',graph_api_version:'v21.0'})
console.log('USER_INFO.data:', JSON.stringify(info?.data)?.slice(0,500))
const k1 = await ex('INSTAGRAM_GET_USER_INSIGHTS',{metric:['reach','views','total_interactions','accounts_engaged'],period:'days_28',metric_type:'total_value'})
console.log('KPI total_value rows:', JSON.stringify(k1?.data)?.slice(0,600))
