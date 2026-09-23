const http=require("node:http");
const fs=require("node:fs");
const path=require("node:path");
const root=__dirname;
const port=Number(process.env.PORT||4173);
const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json; charset=utf-8",".webmanifest":"application/manifest+json; charset=utf-8",".png":"image/png",".svg":"image/svg+xml",".xml":"application/xml; charset=utf-8",".txt":"text/plain; charset=utf-8"};
const server=http.createServer((request,response)=>{
  const pathname=decodeURIComponent(new URL(request.url,"http://localhost").pathname);
  const relative=pathname==="/"?"index.html":pathname.replace(/^\/+/,"");
  let file=path.resolve(root,relative);
  if(file!==root&&!file.startsWith(`${root}${path.sep}`)){
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  const exists=fs.existsSync(file)&&!fs.statSync(file).isDirectory();
  if(!exists)file=path.join(root,"404.html");
  const status=exists?200:404;
  response.writeHead(status,{"Content-Type":types[path.extname(file).toLowerCase()]||"application/octet-stream","Cache-Control":"no-cache"});
  fs.createReadStream(file).pipe(response);
});
server.listen(port,"0.0.0.0",()=>console.log(`Licencia Chile: http://localhost:${port}`));
