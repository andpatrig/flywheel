// markup for the live screen
export default `
      <div class="display" id="display">
        <article class="panel" data-panel="metrics">
          <div class="hero">
            <div class="hero-top"><div class="eyebrow" id="heroLbl">Pace <span>/500m</span></div><span class="phase" id="phase">Ready</span></div>
            <div class="hv num" id="heroVal">–:––</div>
            <div class="hs num" id="heroSub">avg –:––</div>
          </div>
          <div class="tiles">
            <div class="tile"><div class="tl">Rate</div><div class="tv num"><span id="mSpm">–</span><span class="tu">spm</span></div></div>
            <div class="tile"><div class="tl" id="mAltLbl">Power</div><div class="tv num"><span id="mAlt">–</span><span class="tu" id="mAltU">W</span></div></div>
            <div class="tile"><div class="tl">Distance</div><div class="tv num"><span id="mDist">–</span><span class="tu">m</span></div></div>
            <div class="tile"><div class="tl">Time</div><div class="tv num" id="mTime">0:00</div></div>
            <div class="tile"><div class="tl">Heart rate</div><div class="tv num"><span id="mHr">–</span><span class="tu">bpm</span></div></div>
            <div class="tile"><div class="tl">Drive : Rec</div><div class="tv num" id="mRatio">–</div></div>
            <div class="tile"><div class="tl">Strokes</div><div class="tv num" id="mStrokes">0</div></div>
            <div class="tile"><div class="tl">Drag</div><div class="tv num" id="mDrag">–</div></div>
            <div class="tile extra"><div class="tl">Drive length</div><div class="tv num"><span id="mDl">–</span><span class="tu">m</span></div></div>
            <div class="tile extra"><div class="tl">Calories</div><div class="tv num"><span id="mCal">–</span><span class="tu">kcal</span></div></div>
          </div>
        </article>

        <article class="panel" data-panel="power">
          <div class="ph"><div><div class="pt">Power</div><div class="ps num" id="pwrSub">per stroke</div></div>
            <div class="ro num"><span id="pwrNow">–</span><span class="u">W</span></div></div>
          <div class="plot" id="pwrPlot"></div>
        </article>

        <article class="panel" data-panel="force">
          <div class="ph"><div><div class="pt">Force curve</div><div class="ps num" id="forceSub">this stroke vs. average</div></div>
            <div class="ro num"><span id="forceNow">–</span><span class="u">N</span></div></div>
          <div class="plot" id="forcePlot"></div>
        </article>

        <article class="panel" data-panel="cycle">
          <div class="ph"><div><div class="pt">Stroke cycle</div><div class="ps num" id="cycSub">drive and recovery as one turn</div></div>
            <div class="rcol"><div class="ro num"><span id="cycNow">0</span><span class="u">on pace</span></div><div class="step" data-step><button type="button" data-d="-1" aria-label="Slower target">−</button><span class="num" data-tgt>2:00.0</span><button type="button" data-d="1" aria-label="Faster target">+</button></div></div></div>
          <div class="plot svgplot" id="cycPlot"></div>
        </article>

        <article class="panel" data-panel="pace">
          <div class="ph"><div><div class="pt">Pace</div><div class="ps num" id="paceSub">faster is up</div></div>
            <div class="ro num"><span id="paceNow">–:––</span><span class="u">/500m</span></div></div>
          <div class="plot" id="pacePlot"></div>
        </article>

        <article class="panel" data-panel="map">
          <div class="ph"><div><div class="pt">Stroke map</div><div class="ps num" id="mapSub">force over every stroke</div></div>
            <div class="ro num"><span id="mapNow">–</span><span class="u">% peak</span></div></div>
          <div class="plot" id="mapPlot"></div>
        </article>
        <article class="panel" data-panel="boat">
          <div class="ph"><div><div class="pt">Pace boat</div><div class="ps num" id="boatSub">a boat at your target pace</div></div>
            <div class="rcol"><div class="ro num"><span id="boatNow">0.0</span><span class="u" id="boatU">m</span></div><div class="step" data-step><button type="button" data-d="-1" aria-label="Slower target">−</button><span class="num" data-tgt>2:00.0</span><button type="button" data-d="1" aria-label="Faster target">+</button></div></div></div>
          <div class="plot svgplot" id="boatPlot"></div>
          <div class="pbar"><div class="pl"><span class="k" id="pbLk">Covered</span><span class="v num" id="pbL">0 m</span></div>
            <div class="track"><i id="pbFill"></i><b id="pbOpp"></b></div>
            <div class="pr"><span class="k" id="pbRk">To go</span><span class="v num" id="pbR">–</span></div></div>
        </article>
      </div>

      <footer class="controls">
        <button class="ctl" id="displayBtn"><span class="k">Display</span><span class="v" id="displayName">Metrics</span></button>
        <div class="pips" id="pips" aria-hidden="true"></div>
        <button class="ctl" id="unitsBtn"><span class="k">Units</span><span class="v" id="unitsName">/500m</span></button>
        <button class="ctl" id="saveBtn" disabled><span class="k" id="saveK">Session</span><span class="v norm">Save</span><span class="v conf">Tap to save</span></button>
      </footer>
`;
