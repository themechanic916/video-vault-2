const $=s=>document.querySelector(s);
const player=$("#player"),fileInput=$("#fileInput"),statusEl=$("#uploadStatus");
let selectedFiles=[],videos=JSON.parse(localStorage.getItem("vv_meta")||"[]"),urls=new Map(),sb=null,user=null;
let audioCtx=null,source=null,filters=[];
const F=[31,62,125,250,500,1000,2000,4000,8000,16000];
const P={flat:[0,0,0,0,0,0,0,0,0,0],bass:[7,6,5,3,1,0,0,0,0,0],voice:[-2,-1,0,2,4,5,4,2,0,-1],treble:[0,0,0,0,0,1,3,5,6,7]};
const esc=s=>(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const bytes=n=>{let x=Number(n)||0,u=["B","KB","MB","GB","TB"],i=0;while(x>=1024&&i<u.length-1){x/=1024;i++}return x.toFixed(i?1:0)+" "+u[i]};
const save=()=>localStorage.setItem("vv_meta",JSON.stringify(videos.filter(v=>v.mode==="local")));

function setFiles(fs){selectedFiles=[...fs].filter(f=>f.type.startsWith("video/"));statusEl.textContent=selectedFiles.length?selectedFiles.length+" video(s) selected":"No video files selected"}
fileInput.onchange=e=>setFiles(e.target.files);
["dragenter","dragover"].forEach(ev=>$("#dropzone").addEventListener(ev,e=>{e.preventDefault();$("#dropzone").classList.add("drag")}));
["dragleave","drop"].forEach(ev=>$("#dropzone").addEventListener(ev,e=>{e.preventDefault();$("#dropzone").classList.remove("drag")}));
$("#dropzone").addEventListener("drop",e=>setFiles(e.dataTransfer.files));

function initSupabase(){
  const url=localStorage.getItem("vv_url"),key=localStorage.getItem("vv_key");
  if(url&&key&&window.supabase){
    sb=window.supabase.createClient(url,key);
    sb.auth.getUser().then(({data})=>{user=data.user||null;showAuth();if(user)loadCloud()})
  }
}
function showAuth(msg=""){ $("#authStatus").textContent=msg||(user?"Signed in: "+user.email:"Not signed in") }
$("#settingsBtn").onclick=()=>{$("#supabaseUrl").value=localStorage.getItem("vv_url")||"";$("#supabaseKey").value=localStorage.getItem("vv_key")||"";showAuth();$("#settingsDialog").showModal()};
$("#saveSettings").onclick=()=>{localStorage.setItem("vv_url",$("#supabaseUrl").value.trim());localStorage.setItem("vv_key",$("#supabaseKey").value.trim());initSupabase();showAuth("Settings saved")};
$("#signUpBtn").onclick=async()=>{if(!sb)return showAuth("Save Supabase settings first");const{data,error}=await sb.auth.signUp({email:$("#email").value,password:$("#password").value});if(error)return showAuth(error.message);user=data.user;showAuth("Account created. Check email if confirmation is enabled.")};
$("#signInBtn").onclick=async()=>{if(!sb)return showAuth("Save Supabase settings first");const{data,error}=await sb.auth.signInWithPassword({email:$("#email").value,password:$("#password").value});if(error)return showAuth(error.message);user=data.user;showAuth();loadCloud()};
$("#signOutBtn").onclick=async()=>{if(sb)await sb.auth.signOut();user=null;videos=videos.filter(v=>v.mode==="local");showAuth();render()};

async function loadCloud(){
  const{data,error}=await sb.from("videos").select("*").order("created_at",{ascending:false});
  if(error){statusEl.textContent=error.message;return}
  videos=[...(data||[]).map(v=>({...v,mode:"cloud"})),...videos.filter(v=>v.mode==="local")];render()
}
async function signedUrl(v){const{data,error}=await sb.storage.from("video-vault").createSignedUrl(v.storage_path,3600);if(error)throw error;return data.signedUrl}

$("#uploadBtn").onclick=async()=>{
  if(!selectedFiles.length)return statusEl.textContent="Choose at least one video";
  const category=$("#categoryInput").value.trim()||"Uncategorized";
  const tags=$("#tagsInput").value.split(",").map(x=>x.trim()).filter(Boolean);
  if(sb&&user){
    for(const f of selectedFiles){
      statusEl.textContent="Uploading "+f.name+"...";
      const path=user.id+"/"+crypto.randomUUID()+"-"+f.name.replace(/[^\w.\-]+/g,"_");
      const{error:e1}=await sb.storage.from("video-vault").upload(path,f,{contentType:f.type});if(e1)return statusEl.textContent=e1.message;
      const{error:e2}=await sb.from("videos").insert({user_id:user.id,name:f.name,storage_path:path,size:f.size,mime:f.type,category,tags});if(e2)return statusEl.textContent=e2.message
    }
    selectedFiles=[];fileInput.value="";statusEl.textContent="Upload complete";await loadCloud()
  }else{
    selectedFiles.forEach(f=>{const id=crypto.randomUUID();urls.set(id,URL.createObjectURL(f));videos.unshift({id,name:f.name,size:f.size,mime:f.type,category,tags,created_at:new Date().toISOString(),mode:"local"})});
    selectedFiles=[];fileInput.value="";save();statusEl.textContent="Local preview only — not backed up to cloud";render()
  }
};

async function playVideo(id){
  const v=videos.find(x=>x.id===id);if(!v)return;
  try{
    const src=v.mode==="cloud"?await signedUrl(v):urls.get(v.id);
    if(!src)return alert("Local preview expired after refresh. Re-select the file or use cloud storage.");
    player.src=src;$("#nowPlaying").textContent=v.name;$("#nowMeta").textContent=v.category+" • "+bytes(v.size);await player.play();setupAudio()
  }catch(e){alert(e.message||e)}
}
async function deleteVideo(id){
  const v=videos.find(x=>x.id===id);if(!v||!confirm('Delete "'+v.name+'" from Video Vault?'))return;
  if(v.mode==="cloud"){
    let{error}=await sb.storage.from("video-vault").remove([v.storage_path]);if(error)return alert(error.message);
    ({error}=await sb.from("videos").delete().eq("id",id));if(error)return alert(error.message)
  }else{const u=urls.get(id);if(u)URL.revokeObjectURL(u);urls.delete(id)}
  videos=videos.filter(x=>x.id!==id);save();render()
}
window.playVideo=playVideo;window.deleteVideo=deleteVideo;

function render(){
  const q=$("#searchInput").value.toLowerCase().trim(),cat=$("#categoryFilter").value,sort=$("#sortSelect").value;
  let rows=videos.filter(v=>{const h=(v.name+" "+v.category+" "+(v.tags||[]).join(" ")).toLowerCase();return(!q||h.includes(q))&&(!cat||v.category===cat)});
  rows.sort((a,b)=>sort==="oldest"?new Date(a.created_at)-new Date(b.created_at):sort==="name"?a.name.localeCompare(b.name):sort==="size"?(b.size||0)-(a.size||0):new Date(b.created_at)-new Date(a.created_at));
  const cats=[...new Set(videos.map(v=>v.category).filter(Boolean))].sort(),current=$("#categoryFilter").value;
  $("#categoryFilter").innerHTML='<option value="">All categories</option>'+cats.map(c=>'<option '+(c===current?"selected":"")+'>'+esc(c)+'</option>').join("");
  $("#library").innerHTML=rows.map(v=>'<article class="card"><div class="thumb">▶</div><div class="card-body"><h3 title="'+esc(v.name)+'">'+esc(v.name)+'</h3><div class="meta">'+esc(v.category)+' • '+bytes(v.size)+' • '+(v.mode==="cloud"?"Cloud":"Local preview")+'</div><div class="tags">'+(v.tags||[]).map(t=>'<span class="tag">'+esc(t)+'</span>').join("")+'</div><div class="actions"><button onclick="playVideo(\''+v.id+'\')">Play</button><button class="danger" onclick="deleteVideo(\''+v.id+'\')">Delete</button></div></div></article>').join("");
  $("#emptyState").style.display=rows.length?"none":"block";$("#countLabel").textContent=rows.length+" video"+(rows.length===1?"":"s")
}
["#searchInput","#categoryFilter","#sortSelect"].forEach(s=>$(s).addEventListener(s==="#searchInput"?"input":"change",render));

function setupEq(){
  $("#eq").innerHTML=F.map((f,i)=>'<label class="eq-band">'+(f>=1000?f/1000+"k":f)+'<input type="range" min="-12" max="12" step="1" value="0" data-i="'+i+'"></label>').join("");
  $("#eq").querySelectorAll("input").forEach(sl=>sl.oninput=()=>{const i=+sl.dataset.i;if(filters[i])filters[i].gain.value=+sl.value})
}
function setupAudio(){
  if(source)return;
  audioCtx=new(window.AudioContext||window.webkitAudioContext)();source=audioCtx.createMediaElementSource(player);
  filters=F.map((f,i)=>{const b=audioCtx.createBiquadFilter();b.type=i===0?"lowshelf":i===F.length-1?"highshelf":"peaking";b.frequency.value=f;b.Q.value=1;return b});
  source.connect(filters[0]);for(let i=0;i<filters.length-1;i++)filters[i].connect(filters[i+1]);filters.at(-1).connect(audioCtx.destination)
}
document.querySelectorAll(".preset").forEach(b=>b.onclick=()=>{const a=P[b.dataset.preset];$("#eq").querySelectorAll("input").forEach((sl,i)=>{sl.value=a[i];if(filters[i])filters[i].gain.value=a[i]})});

setupEq();initSupabase();render();
if("serviceWorker"in navigator)window.addEventListener("load",()=>navigator.serviceWorker.register("sw.js"));