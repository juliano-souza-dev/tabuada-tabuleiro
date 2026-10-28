const CACHE='tabuada-v13';
const ASSETS=[
 './','./index.html','./style.css','./app.js','./weather.js','./sound.js','./audio-test.js',
 './online.js','./online-logic.js','./online-ui.js','./firebase-config.js',
 './manifest.webmanifest','./assets/path.json','./assets/special-spaces.json',
 './assets/mapa-oficial.webp',
 ...['trap','quicksand','portal','chest'].map(n=>'./assets/events/'+n+'.svg'),
 ...['masculino-01','masculino-02','masculino-03','masculino-04','masculino-05','feminino-01','feminino-02','feminino-03','feminino-04','feminino-05'].map(n=>'./assets/avatars/'+n+'.svg')
];
self.addEventListener('install',event=>event.waitUntil(
 caches.open(CACHE).then(cache=>cache.addAll(ASSETS)).then(()=>self.skipWaiting())
));
self.addEventListener('activate',event=>event.waitUntil(
 caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())
));
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
 const url=new URL(event.request.url);
 if(url.pathname.endsWith('/firebase-config.js')){
  // Updated Firebase configuration should be effective after the next online reload.
  event.respondWith(fetch(event.request).then(response=>{
   if(response.ok){
    const copy=response.clone();
    event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,copy)));
   }
   return response;
  }).catch(()=>caches.match(event.request)));
  return;
 }
 event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request)));
});
