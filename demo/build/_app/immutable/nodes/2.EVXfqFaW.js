import{A as e,B as t,D as n,E as r,F as i,I as a,L as o,M as s,P as c,S as l,U as u,V as d,b as f,c as p,f as m,g as h,h as g,j as _,l as v,m as ee,o as y,p as b,s as x,v as S,x as C}from"../chunks/Bbu7-7Nv.js";import"../chunks/DEDqjojZ.js";function w(e){let t=new T;return t.feed(e),{css:t.getCSS(),errors:t.getErrors()}}var T=class{#e=``;#t=[];#n={":root":[]};#r={};#i={};#a=[];#o=[];#s=!1;#c=null;#l=[];#u=0;feed(e){this.#e=e,this.run()}run(){this.#t=[],this.#n={":root":[]},this.#r={},this.#i={},this.#a=[],this.#o=[],this.#s=!1,this.#c=null,this.#l=[],this.#u=0;let e=this.#e.split(`
`);for(let t=0;t<e.length;t++)try{this.#d(this.#f(e[t]).trim())}catch(e){this.#O(`line `+(t+1),e)}this.#s&&this.#O(`parse`,`unclosed function block`),this.#t.length&&this.#O(`parse`,`unclosed style block`);for(let e=0;e<Object.keys(this.#n).length;e++)this.#a.push(Object.keys(this.#n)[e]+`{`),this.#a.push(`	`+(Object.values(this.#n)[e]||[]).join(`
	`)),this.#a.push(`}`)}getCSS(){return this.#a.join(`
`)}getErrors(){return this.#o}#d(e){if(!e)return;let t=e[e.length-1],n=e[0],r=e.split(` `)[0];r!=`//`&&r!=`<!--`&&(this.#s?this.#p(e,t):this.#m(e,n,r))}#f(e){let t=null,n=!1;for(let r=0;r<e.length;r++){let i=e[r],a=e[r+1];if(n){n=!1;continue}if(i==`\\`){n=!0;continue}if(t){i==t&&(t=null);continue}if(i==`"`||i==`'`||i=="`"){t=i;continue}if(i==`/`&&a==`/`)return e.slice(0,r)}return e}#p(e,t){if(t==`{`)this.#u++,this.#l.push(this.#D(e));else if(e==`}`)if(this.#u!=0)this.#u--,this.#l.push(this.#D(e));else{try{if(!this.#c?.name)throw Error(`invalid function signature`);let e=this.#c.params||[];this.#i[this.#c.name]={name:this.#c.name,params:e,body:this.#l,function:Function(...e,this.#l.join(`
`))}}catch(e){this.#O(`add func`,e)}this.#s=!1,this.#c=null,this.#l=[],this.#u=0}else this.#l.push(this.#D(e))}#m(e,t,n){if(n==`func`){let t=this.#b(e);if(!t?.[0])return this.#O(`func`,`invalid function signature`);this.#s=!0,this.#c=t[0]}else if(e.includes(`{`)&&e.includes(`}`))this.#h(e);else if(e.includes(`{`))this.#t.push(e.replace(`{`,``).trim()),this.#n[this.#C()]=[];else if(e==`}`)this.#t.length?this.#t.pop():this.#O(`layer`,`unexpected closing brace`);else if(n==`def`)this.#w(e.replace(`def `,``));else if(t==`_`)this.#w(e);else if(e.includes(`:`)){let t=this.#C()||`:root`;this.#n[t]||(this.#n[t]=[]),this.#n[t].push(this.#y(this.#T(e)))}}#h(e){let t=e.slice(0,e.indexOf(`{`)).trim(),n=e.slice(e.indexOf(`{`)+1,e.lastIndexOf(`}`)).trim();if(!t)return this.#O(`layer`,`invalid inline style selector`);this.#t.push(t);let r=this.#C();this.#n[r]||(this.#n[r]=[]),n&&this.#g(n),this.#t.pop()}#g(e){let t=``;for(let n=0;n<e.length;n++){let r=e[n];if(r==`{`){let r=t.split(`;`),i=(r.pop()||``).trim();this.#_(r.join(`;`));let a=this.#v(e,n);if(!i||a==-1){this.#O(`layer`,`invalid nested inline style block`);return}this.#t.push(i);let o=this.#C();this.#n[o]||(this.#n[o]=[]),this.#g(e.slice(n+1,a).trim()),this.#t.pop(),t=``,n=a}else t+=r}this.#_(t)}#_(e){let t=e.split(`;`),n=this.#C();this.#n[n]||(this.#n[n]=[]);for(let e=0;e<t.length;e++){let r=t[e].trim();r&&this.#n[n].push(this.#y(r+`;`))}}#v(e,t){let n=0;for(let r=t;r<e.length;r++)if(e[r]==`{`)n++;else if(e[r]==`}`&&(n--,n==0))return r;return-1}#y(e){let t=e.split(``);return e.split(` `)[0]==`def`&&(e=e.replace(`def `,`--`)),t.includes(`_`)&&(e=this.#S(e)),e.includes(`(`)&&e.includes(`)`)&&(e=this.#x(e)),e}#b(e){if(!e.includes(`(`))return null;let t=[],n=e,r=e.split(`(`).length-1;for(let e=0;e<r;e++){let e=n.indexOf(`(`),r=``,i=``;for(let t=e;t>0;--t){let e=n[t-1];if(e!=` `)r=e+r;else break}for(let t=e;t<n.length;++t){let e=n[t+1];if(e!=`)`)i+=e;else break}t.push({name:r,params:i.split(`,`).map(e=>e.trim()).filter(e=>e),call:r+`(`+i+`)`}),n=n.replace(`(`,`_`)}return t}#x(e){let t=this.#b(e);if(!t)return e;for(let n=0;n<t.length;n++){let r=t[n].name,i=t[n].params,a=this.#i?.[r],o=t[n].call||r+`(`+i+`)`;if(a)try{let t=a.function(...i);e=e.replace(o,String(t))}catch(e){this.#O(`handleFunctionCalls`,e)}}return e}#S(e){let t=``;for(let n=e.indexOf(`_`)+1;n<e.length&&e[n]!=`_`;n++)t+=e[n];return!t||this.#r[t]==null?e:(e=e.replace(`_`+t+`_`,this.#r[t]),e.includes(`_`)?this.#S(e):e)}#C(){return this.#t.join(` `).replaceAll(` :`,`:`)}#w(e){let t=e.split(`:`)[0].replaceAll(`_`,``).trim(),n=this.#E(e.slice(e.indexOf(`:`)+1).trim());if(!e.includes(`:`)||!t)return this.#O(`var`,`invalid variable definition`);let r=this.#y(n);this.#r[t]=r;let i=`--`+t+`: `+r;this.#n[`:root`].push(this.#T(i))}#T(e){return e.trim().endsWith(`;`)?e:e+`;`}#E(e){return e.trim().endsWith(`;`)?e.trim().slice(0,-1).trim():e}#D(e){return e.includes(`_`)?this.#S(e):e}#O(e,t){let n=t instanceof Error?t.message:String(t);this.#o.push(e+`: `+n)}},E=S(`<meta name="description" content="A live Rue stylesheet language playground showing nested CSS, variables, functions, and inline nested styles."/>`),D=S(`<li> </li>`),O=S(`<ul class="errors svelte-1uha8ag"></ul>`),k=S(`<main class="page-shell svelte-1uha8ag"><header class="site-header svelte-1uha8ag"><div><p class="kicker svelte-1uha8ag">Stylesheet compiler</p> <h1 class="svelte-1uha8ag">Rue Language</h1> <p class="svelte-1uha8ag">written by Aaron Meche</p></div> <a class="repo-link svelte-1uha8ag" href="https://github.com/aaron-meche/rue-lang">GitHub</a></header> <section class="workspace svelte-1uha8ag" aria-label="Rue live compiler demo"><div class="editor-panel svelte-1uha8ag"><div class="panel-bar svelte-1uha8ag"><div><h2 class="svelte-1uha8ag">Rue source</h2> <span class="svelte-1uha8ag">Edit nested styles, functions, and variables.</span></div> <span class="pill svelte-1uha8ag"> </span></div> <textarea spellcheck="false" aria-label="Rue source editor" class="svelte-1uha8ag"></textarea></div> <div class="preview-column svelte-1uha8ag"><div class="preview-panel svelte-1uha8ag"><div class="panel-bar svelte-1uha8ag"><div><h2 class="svelte-1uha8ag">Live HTML viewer</h2> <span class="svelte-1uha8ag">Compiled CSS is injected into this preview.</span></div> <span> </span></div> <iframe title="Rue compiled preview" sandbox="allow-popups allow-popups-to-escape-sandbox" class="svelte-1uha8ag"></iframe></div></div> <div class="css-panel svelte-1uha8ag"><div class="panel-bar compact svelte-1uha8ag"><h2 class="svelte-1uha8ag">Generated CSS</h2> <span class="svelte-1uha8ag"> </span></div> <!> <pre class="svelte-1uha8ag"> </pre></div></section></main>`);function A(f,S){d(S,!0);let T=a(`_accent-hue_: 175
	
func getAccentDeriv(sat, light, a = 1) {
    let hueStr     = _accent-hue_ + " "
    let satStr     = sat + "% "
    let lightStr   = light + "% / " + a
    let fullStr    = "hsl(" + hueStr + satStr + lightStr + ")"
    return fullStr
}

func rem(value) {
    return value + "rem"
}

_l0_:     getAccentDeriv( 8,  8)  // layer 0 (bg)
_l1_:     getAccentDeriv(12, 12)  // layer 1 (panel)
_accent_: getAccentDeriv(75, 50)  // accent color

body{
    margin: 0
    height: 100vh
    display: grid
    place-items: center
    background: _l0_
    color: white
    font-family: Inter, ui-sans-serif, system-ui
}

.demo-card{
    width: calc(100vw - rem(6))
    padding: rem(2)
    background: var(--panelBg)
    border: 1px solid _accent_
    border-radius: 18px
    box-shadow: inset 0 0 rem(6) getAccentDeriv(75, 50, 0.1)

    .eyebrow{
        color: _accent_
        text-transform: uppercase
        font-size: rem(0.8)
        letter-spacing: rem(0.1)
        font-weight: 800
    }

    h1{
        all: unset;
        font-size: rem(3)
		font-weight: 700;
        line-height: 0.9
    }

    .caption{
        color: getAccentDeriv(12, 60)
        line-height: 1.8
    }
}

.actions { 
	display: flex
	gap: rem(0.8)
	margin-block: rem(1.2)

	a { 
		all: unset
		border-radius: 100vh
		padding: rem(0.8) rem(1.6)
		background: _accent_
		color: black
		font-weight: 800
		cursor: pointer
		outline: 1px solid _accent_

		:hover{ text-decoration: underline }
	} 

	.ghost { 
		background: transparent
		color: _accent_
	} 
}

.feature-grid{
    display: grid
    grid-template-columns: 1fr 1fr
    gap: rem(1)

    .feature{
		display: grid;
		gap: rem(0.25)
        padding: 1rem
        background: getAccentDeriv(10, 30, 0.2)
        border-radius: 14px

        strong{ display: block }
        span{ color: getAccentDeriv(8, 70); line-height: 1.5 }
    }
}`),A=o(()=>w(l(T))),j=o(()=>`<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<base target="_blank" />
<style>${l(A).css}</style>
</head>
<body>
<main class="demo-card">
    <p class="eyebrow">Rue Live Preview</p>
    <h1>Nested CSS with JS integration.</h1>
    <p class="caption">Edit the "Rue Source" and watch this live preview update instantly.</p>
    <div class="actions">
        <a href="https://github.com/aaron-meche/rue-lang#readme">Read Docs</a>
        <a href="https://www.npmjs.com/package/rue-lang" class="ghost">View NPM</a>
    </div>
    <section class="feature-grid">
        <article class="feature">
            <strong>Compile-time variables</strong>
            <span>Rue swaps _tokens_ before CSS is emitted.</span>
        </article>
        <article class="feature">
            <strong>Nested styles</strong>
            <span>Selectors can live where their components live.</span>
        </article>
    </section>
</main></body>
</html>`);function M(e){if(e.key!==`Tab`)return;e.preventDefault();let t=e.currentTarget,n=t.selectionStart,r=t.selectionEnd,a=t.value.slice(0,n)+`    `+t.value.slice(r),o=n+4;t.value=a,i(T,a),requestAnimationFrame(()=>{t.selectionStart=o,t.selectionEnd=o})}var N=k();v(`1uha8ag`,e=>{var t=E();r(()=>{_.title=`Rue Language Demo`}),h(e,t)});var P=c(s(N),2),F=s(P),I=s(F),L=c(s(I),2),R=s(L);u(L),u(I);var z=c(I,2);e(z),u(F);var B=c(F,2),V=s(B),H=s(V),U=c(s(H),2);let W;var G=s(U,!0);u(U),u(H);var K=c(H,2);u(V),u(B);var q=c(B,2),J=s(q),Y=c(s(J),2),X=s(Y);u(Y),u(J);var Z=c(J,2),Q=e=>{var t=O();m(t,21,()=>l(A).errors,b,(e,t)=>{var r=D(),i=s(r,!0);u(r),n(()=>g(i,l(t))),h(e,r)}),u(t),h(e,t)};ee(Z,e=>{l(A).errors.length&&e(Q)});var $=c(Z,2),te=s($,!0);u($),u(q),u(P),u(N),n(e=>{g(R,`${e??``} lines`),W=p(U,1,`pill svelte-1uha8ag`,null,W,{error:l(A).errors.length>0}),g(G,l(A).errors.length?`${l(A).errors.length} errors`:`clean`),x(K,`srcdoc`,l(j)),g(X,`${l(A).css.length??``} chars`),g(te,l(A).css)},[()=>l(T).split(`
`).length]),C(`keydown`,z,M),y(z,()=>l(T),e=>i(T,e)),h(f,N),t()}f([`keydown`]);export{A as component};