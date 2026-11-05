// markup for the live screen
export default `
      <div class="display" id="display">
        <div class="done" id="doneCard" hidden><div class="dc">
          <div class="eyebrow" id="dcK">Piece complete</div><div class="dcbig num" id="dcBig"></div>
          <div class="dcgrid" id="dcGrid"></div>
          <div class="row"><button class="btn" id="dcClose">Close</button><button class="btn primary" id="dcReport">Session report</button></div>
        </div></div>
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

        <article class="panel" data-panel="proj">
          <div class="ph"><div><div class="pt">Projection</div><div class="ps" id="prSub">at your pace over the last 20 s</div></div></div>
          <div class="proj" id="proj">
            <div class="prmain"><div class="eyebrow" id="prK">Projected finish</div><div class="prbig num" id="prBig">–:––.–</div><div class="prdelta num" id="prDelta">&nbsp;</div></div>
            <div class="prrows">
              <div class="prr"><span class="k" id="prBestK">Best</span><span class="v num" id="prBest">–</span></div>
              <div class="prr"><span class="k">Pace to beat it</span><span class="v num" id="prNeed">–</span><span class="d" id="prNeedK"></span></div>
              <div class="prr"><span class="k">Current pace</span><span class="v num" id="prNow">–</span><span class="d">last 20 s</span></div>
            </div>
            <div class="prbar"><i id="prFill"></i></div>
          </div>
          <div class="proj-empty" id="projEmpty">Program a single distance or time on the PM5 to see where this piece is heading.</div>
          <p class="how">The projection assumes your recent pace is held to the end. The pace to beat your best is what the rest of the piece needs: if it is slower than your current pace, you have margin.</p>
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

        <article class="panel" data-panel="cycle"><div class="inst">
          <div class="ph"><div><div class="pt">Stroke cycle</div><div class="ps num" id="cycSub">drive and recovery as one turn</div></div>
            <div class="rcol"><div class="ro num"><span id="cycNow">0</span><span class="u">at target</span></div><div class="step" data-step><button type="button" data-d="-1" aria-label="Slower target">−</button><span class="num" data-tgt>2:00.0</span><button type="button" data-d="1" aria-label="Faster target">+</button></div></div></div>
          <div class="plot svgplot" id="cycPlot"></div>
          <dl class="side" id="cycSide"></dl>
          <p class="how">The petal is the last drive's handle force (dashed: your average). The segments count strokes in a row at or faster than the target pace.</p>
        </div></article>

        <article class="panel" data-panel="cons">
          <div class="ph"><div><div class="pt">Consistency</div><div class="ps num" id="csSub">last 20 strokes</div></div>
            <div class="ro num"><span id="csNow">–</span><span class="u">%</span></div></div>
          <div class="plot svgplot" id="csPlot"></div>
          <p class="how">Each tile is one stroke's force curve over your session average (dashed). The score is how closely it matches: higher means more repeatable strokes.</p>
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
        <article class="panel" data-panel="boat"><div class="inst">
          <div class="ph"><div><div class="pt">Pace boat</div><div class="ps num" id="boatSub">a boat at your target pace</div></div>
            <div class="rcol"><div class="ro num"><span id="boatNow">0.0</span><span class="u" id="boatU">m</span></div><div class="step" data-step><button type="button" data-d="-1" aria-label="Slower target">−</button><span class="num" data-tgt>2:00.0</span><button type="button" data-d="1" aria-label="Faster target">+</button></div></div></div>
          <div class="plot svgplot" id="boatPlot"></div>
          <div class="pbar"><div class="pl"><span class="k" id="pbLk">Covered</span><span class="v num" id="pbL">0 m</span></div>
            <div class="track"><i id="pbFill"></i><b id="pbOpp"></b></div>
            <div class="pr"><span class="k" id="pbRk">To go</span><span class="v num" id="pbR">–</span></div></div>
        </div></article>
      </div>

      <footer class="controls">
        <button class="ctl" id="displayBtn"><span class="k">Display</span><span class="v" id="displayName">Metrics</span></button>
        <div class="pips" id="pips" aria-hidden="true"></div>
        <button class="ctl" id="unitsBtn"><span class="k">Units</span><span class="v" id="unitsName">/500m</span></button>
        <button class="ctl" id="saveBtn" disabled><span class="k" id="saveK">Session</span><span class="v norm">Save</span><span class="v conf">Tap to save</span></button>
      </footer>
`;
