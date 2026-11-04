// markup for the history screen
export default `
      <div class="page wide">
        <div id="historyFilters" class="chips" style="max-width:820px;margin:0 auto 12px"></div>
        <div id="historyList" class="list" style="max-width:820px;margin:0 auto"></div>
        <div id="historyEmpty" class="empty">No saved sessions yet. Connect, row, then tap <b>Save</b>.</div>
        <div id="sessionDetail" hidden>
          <div class="row">
            <button class="btn" id="backBtn">← Sessions</button><span style="flex:1"></span>
            <button class="btn primary" id="jsonBtn">Export JSON</button><button class="btn" id="copyBtn">Copy</button>
            <button class="btn danger" id="delBtn"><span class="norm">Delete</span><span class="conf">Delete?</span></button>
          </div>
          <div class="dhead"><div><h1 id="dTitle"></h1><div class="meta" id="dMeta"></div></div></div>
          <div class="stats" id="dStats"></div>
          <div class="agrid">
            <div class="card span2"><h2>Pace, rate &amp; heart rate</h2><div class="sub">aligned on elapsed time · faster pace is up</div><div class="hplot tall" id="hTrend"></div></div>
            <div class="card"><h2>Splits</h2><div class="sub" id="hSplitsSub">pace per split</div><div class="hplot" id="hSplits"></div></div>
            <div class="card"><h2>Power distribution</h2><div class="sub" id="hHistSub">strokes by watts · band = mean ± 1σ</div><div class="hplot" id="hHist"></div></div>
            <div class="card"><h2>Force curve</h2><div class="sub">mean ± 1σ, first vs. last quarter of the session</div><div class="hplot" id="hForce"></div></div>
            <div class="card"><h2>Rate vs. power</h2><div class="sub">each stroke · color = elapsed time</div><div class="hplot" id="hScatter"></div></div>
            <div class="card"><h2>Stroke map</h2><div class="sub">handle force through the drive, every stroke · dots = peak timing</div><div class="hplot" id="hMap"></div></div>
            <div class="card"><h2>Details</h2><table id="dTable"></table></div>
          </div>
        </div>
      </div>
`;
