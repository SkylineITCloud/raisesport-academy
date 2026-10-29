import {env} from 'cloudflare:workers';
import {application} from './raisesport-server';
export const dynamic='force-dynamic';
export function GET(request:Request){return application(request,env);}
