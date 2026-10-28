const FULLSCREEN_VERTEX = [
  'attribute vec2 aPosition;',
  'varying vec2 vUv;',
  'void main(){',
  ' vUv=(aPosition+1.0)*0.5;',
  ' gl_Position=vec4(aPosition,0.0,1.0);',
  '}'
].join('\n');

const FULLSCREEN_FRAGMENT = [
  'precision mediump float;',
  'varying vec2 vUv;',
  'uniform float uTime;',
  'uniform float uMode;',
  'uniform float uOpacity;',
  'void main(){',
  ' vec2 uv=vUv;',
  ' float wave=sin(uv.x*9.0+uTime*0.35)*0.5+sin(uv.y*6.0-uTime*0.23)*0.5;',
  ' vec3 color=vec3(1.0);',
  ' float alpha=0.0;',
  ' if(uMode<0.5){',
  '   float glow=pow(max(0.0,1.0-distance(uv,vec2(0.86,0.86))*1.1),2.7);',
  '   float ray=pow(max(0.0,sin((uv.x+uv.y*0.19)*36.0+uTime*0.16)),16.0);',
  '   color=vec3(1.0,0.79,0.41);',
  '   alpha=0.035+glow*0.12+ray*0.023;',
  ' }else if(uMode<1.5){',
  '   color=vec3(0.11,0.24,0.40);',
  '   alpha=0.12+wave*0.018;',
  ' }else{',
  '   color=vec3(0.72,0.84,1.0);',
  '   alpha=0.12+wave*0.012;',
  ' }',
  ' gl_FragColor=vec4(color,clamp(alpha*uOpacity,0.0,0.28));',
  '}'
].join('\n');

const PARTICLE_VERTEX=[
  'attribute vec3 aSeed;',
  'uniform float uTime;',
  'uniform float uMode;',
  'uniform float uPixel;',
  'varying float vKind;',
  'varying float vSeed;',
  'void main(){',
  ' float x=aSeed.x;',
  ' float y=aSeed.y;',
  ' float seed=aSeed.z;',
  ' vKind=uMode;',
  ' vSeed=seed;',
  ' if(uMode<0.5){',
  '  x=fract(x+sin(uTime*0.18+seed*22.0)*0.018);',
  '  y=fract(y+uTime*(0.012+seed*0.012));',
  '  gl_PointSize=(2.0+seed*3.0)*uPixel;',
  ' }else if(uMode<1.5){',
  '  x=fract(x+uTime*(0.075+seed*0.025));',
  '  y=fract(y-uTime*(0.52+seed*0.33));',
  '  gl_PointSize=(12.0+seed*11.0)*uPixel;',
  ' }else{',
  '  x=fract(x+sin(uTime*0.33+seed*35.0)*0.035);',
  '  y=fract(y-uTime*(0.038+seed*0.052));',
  '  gl_PointSize=(3.0+seed*5.0)*uPixel;',
  ' }',
  ' gl_Position=vec4(x*2.0-1.0,y*2.0-1.0,0.0,1.0);',
  '}'
].join('\n');

const PARTICLE_FRAGMENT=[
  'precision mediump float;',
  'varying float vKind;',
  'varying float vSeed;',
  'uniform float uOpacity;',
  'void main(){',
  ' vec2 p=gl_PointCoord-vec2(0.5);',
  ' float alpha=0.0;',
  ' vec3 color=vec3(1.0);',
  ' if(vKind<0.5){',
  '  float d=length(p);',
  '  alpha=(1.0-smoothstep(0.12,0.49,d))*0.42;',
  '  color=vec3(1.0,0.89,0.52);',
  ' }else if(vKind<1.5){',
  '  float line=abs(p.x+p.y*0.38);',
  '  alpha=(1.0-smoothstep(0.02,0.10,line))*smoothstep(0.49,0.25,abs(p.y))*0.70;',
  '  color=vec3(0.80,0.92,1.0);',
  ' }else{',
  '  alpha=(1.0-smoothstep(0.25,0.50,length(p)))*0.90;',
  '  color=vec3(0.98,0.99,1.0);',
  ' }',
  ' gl_FragColor=vec4(color,alpha*uOpacity);',
  '}'
].join('\n');

const MODES={sun:0,rain:1,snow:2};

function compileShader(gl,type,source){
  const shader=gl.createShader(type);
  gl.shaderSource(shader,source);
  gl.compileShader(shader);
  if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
    const info=gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error('Shader WebGL: '+info);
  }
  return shader;
}
function createProgram(gl,vertexSource,fragmentSource){
  const program=gl.createProgram();
  const vert=compileShader(gl,gl.VERTEX_SHADER,vertexSource);
  const frag=compileShader(gl,gl.FRAGMENT_SHADER,fragmentSource);
  gl.attachShader(program,vert);
  gl.attachShader(program,frag);
  gl.linkProgram(program);
  gl.deleteShader(vert);
  gl.deleteShader(frag);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)){
    const info=gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('Programa WebGL: '+info);
  }
  return program;
}
function makeParticles(count){
  const data=new Float32Array(count*3);
  for(let i=0;i<count;i++){
    data[i*3]=Math.random();
    data[i*3+1]=Math.random();
    data[i*3+2]=Math.random();
  }
  return data;
}

export class WeatherEngine{
  constructor(canvas,fallback){
    this.canvas=canvas;
    this.fallback=fallback;
    this.mode='sun';
    this.previous='sun';
    this.transitionStart=0;
    this.transitionLength=1650;
    this.raf=0;
    this.gl=null;
    this.startTime=performance.now();
    this.reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
    this.particleSets=[makeParticles(25),makeParticles(115),makeParticles(75)];
    this.buffers=[];
    try{
      this.init();
    }catch(error){
      console.warn('WebGL indisponível. Exibindo clima simplificado.',error);
      this.useFallback();
    }
    document.addEventListener('visibilitychange',()=>{
      if(document.hidden){
        if(this.raf)cancelAnimationFrame(this.raf);
        this.raf=0;
      }else if(this.gl){
        this.start();
      }
    });
    window.addEventListener('resize',()=>this.resize(),{passive:true});
  }
  init(){
    const gl=this.canvas.getContext('webgl',{
      alpha:true,premultipliedAlpha:false,antialias:false,
      depth:false,stencil:false,preserveDrawingBuffer:false,
      powerPreference:'low-power'
    });
    if(!gl)throw new Error('Contexto WebGL não disponível');
    this.gl=gl;
    this.bgProgram=createProgram(gl,FULLSCREEN_VERTEX,FULLSCREEN_FRAGMENT);
    this.particleProgram=createProgram(gl,PARTICLE_VERTEX,PARTICLE_FRAGMENT);
    this.quad=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    this.buffers=this.particleSets.map(data=>{
      const buffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      return buffer;
    });
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    this.canvas.addEventListener('webglcontextlost',event=>{
      event.preventDefault();
      if(this.raf)cancelAnimationFrame(this.raf);
      this.raf=0;
      this.gl=null;
      this.useFallback();
    });
    this.canvas.addEventListener('webglcontextrestored',()=>{
      this.fallback.hidden=true;
      this.canvas.hidden=false;
      this.gl=null;
      try{this.init()}catch(e){this.useFallback()}
    });
    this.fallback.hidden=true;
    this.resize();
    this.start();
  }
  useFallback(){
    this.canvas.hidden=true;
    this.fallback.hidden=false;
    this.fallback.className=this.mode;
  }
  resize(){
    if(!this.gl)return;
    const bounds=this.canvas.getBoundingClientRect();
    const dpr=Math.min(window.devicePixelRatio||1,1.5);
    const width=Math.max(1,Math.round(bounds.width*dpr));
    const height=Math.max(1,Math.round(bounds.height*dpr));
    if(this.canvas.width!==width||this.canvas.height!==height){
      this.canvas.width=width;
      this.canvas.height=height;
    }
    this.gl.viewport(0,0,width,height);
  }
  setMode(mode){
    if(!(mode in MODES)||mode===this.mode)return;
    this.previous=this.mode;
    this.mode=mode;
    this.transitionStart=performance.now();
    if(!this.gl)this.useFallback();
  }
  start(){
    if(!this.gl||this.raf||document.hidden)return;
    const frame=(time)=>{
      this.raf=0;
      if(!this.gl||document.hidden)return;
      this.render(time);
      this.raf=requestAnimationFrame(frame);
    };
    this.raf=requestAnimationFrame(frame);
  }
  render(time){
    const gl=this.gl;
    if(!gl)return;
    const transition=this.transitionStart?Math.min(1,(time-this.transitionStart)/this.transitionLength):1;
    const elapsed=(time-this.startTime)/1000;
    gl.viewport(0,0,this.canvas.width,this.canvas.height);
    gl.clearColor(0,0,0,0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if(this.previous!==this.mode&&transition<1){
      this.drawMode(MODES[this.previous],1-transition,elapsed);
      this.drawMode(MODES[this.mode],transition,elapsed);
    }else{
      this.drawMode(MODES[this.mode],1,elapsed);
      this.previous=this.mode;
    }
  }
  drawMode(mode,opacity,time){
    if(opacity<0.01)return;
    const gl=this.gl;
    gl.useProgram(this.bgProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.quad);
    const pos=gl.getAttribLocation(this.bgProgram,'aPosition');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    gl.uniform1f(gl.getUniformLocation(this.bgProgram,'uTime'),time);
    gl.uniform1f(gl.getUniformLocation(this.bgProgram,'uMode'),mode);
    gl.uniform1f(gl.getUniformLocation(this.bgProgram,'uOpacity'),opacity);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    if(this.reducedMotion)return;
    gl.useProgram(this.particleProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER,this.buffers[mode]);
    const attr=gl.getAttribLocation(this.particleProgram,'aSeed');
    gl.enableVertexAttribArray(attr);
    gl.vertexAttribPointer(attr,3,gl.FLOAT,false,0,0);
    gl.uniform1f(gl.getUniformLocation(this.particleProgram,'uMode'),mode);
    gl.uniform1f(gl.getUniformLocation(this.particleProgram,'uTime'),time);
    gl.uniform1f(gl.getUniformLocation(this.particleProgram,'uOpacity'),opacity);
    gl.uniform1f(gl.getUniformLocation(this.particleProgram,'uPixel'),Math.min(1.8,Math.max(.8,(this.canvas.width/900))));
    gl.drawArrays(gl.POINTS,0,this.particleSets[mode].length/3);
  }
}
