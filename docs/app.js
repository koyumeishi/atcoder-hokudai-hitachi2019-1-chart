
class ChartApp{
  constructor(sheetUrl, taskId){
    this.taskId = taskId;
    this.scoreData = {};

    google.load(
      "visualization",
      "1",
      {
        'packages': ['table', 'corechart'],
        'callback' : () => {
          this.loadSheet(sheetUrl, this.taskId);
        }
      }
    );
  }

  loadSheet(sheetUrl, taskId){
    let query = new google.visualization.Query( sheetUrl + "gviz/tq?range=" + taskId + "!A:B");
    query.setQuery("select *");
    query.send( (res) => {
      let data = res.getDataTable();
      console.log(data.toJSON());
      this.parseData(data);
    });
  }

  parseData(dataTable){
    const rows = dataTable.getNumberOfRows();
    for(let r=1; r<rows; r++){
      let userName = dataTable.getValue(r, 0);
      let data = dataTable.getValue(r, 1);
      this.scoreData[userName] = JSON.parse(data);
    }
    // scoreData = {userName: {score:time, score:time, ... }}

    let p1 = new Promise( r=>{
      try{
        this.makeStandingsTable();
      }catch(e){
        console.log(e);
      }
      r();
    } );
    let p2 = new Promise( r=>{
      try{
        this.drawChart();
      }catch(e){
        console.log(e);
      }
      r();
    } );
    Promise.all([p1,p2]).then( ()=>{
      console.log("done.");
    });
  }

  makeStandingsTable(){
    let scoreData = this.scoreData;
    let standings = new google.visualization.DataTable({
      cols:[
        {id:'rank', label:'Rank', type:'number'},
        {id:'delta-rank', label:'Δ', type:'string'},
        {id:'name', label:'Name', type:'string'},
        {id:'score', label:'Score', type:'number'},
        {id:'score-diff', label:'ΔScore', type:'number'},
        {id:'score-diff-1st', label:'1位との差', type:'number'},
        {id:'time', label:'Time [DD-HH:MM]', type:'string'},
      ],
    });

    // [ [rank, delta-rank, name, score, score-diff, time] ]
    let rows =  Object.keys(scoreData).map( userName => {
      let obj = scoreData[userName];
      let d = Object.keys(obj).reduce( (best, score)=>{
        let elapsed = Number( obj[score] ) / 1000000000;
        let min = Math.floor(elapsed / 60);
        let hour = Math.floor(min / 60);
        min %= 24;
        let day = Math.floor(hour / 24);
        hour %= 24;

        let tmp = {
          time: `0${day}-`.slice(-3) + `0${hour}:`.slice(-3) + `0${min}`.slice(-2),
          score: Number(score)/100
        };
        if( best.score < tmp.score ){
          return tmp;
        }else{
          return best;
        }
      }, {time:-1, score:-1} );
      return [0, 'New', userName, d.score, 0, 0, d.time ];
    });

    let prev = this.getPrevStandings();

    rows.sort( (a,b)=>{return a[3] > b[3] ? -1 : 1;} );
    for(let i=0; i<rows.length; i++){
      rows[i][0] = i+1;
      if( i>0 ){
        if(rows[i][3] == rows[i-1][3] ){
          rows[i][0] = rows[i-1][0];
          // rows[i][4] = rows[i-1][4];
        }else{
          // rows[i][4] = rows[i-1][3] - rows[i][3];
        }
        rows[i][5] = rows[0][3] - rows[i][3];
      }
      if( rows[i][2] in prev ){
        let rankDiff = rows[i][0] - prev[rows[i][2]][1];
        if( rankDiff == 0 ){
          rows[i][1] = '-';
        }else if(rankDiff < 0){
          rows[i][1] = `${-rankDiff} ↑`;
        }else{
          rows[i][1] = `${rankDiff} ↓`;
        }
        let scoreDiff = rows[i][3] - prev[rows[i][2]][2];
        rows[i][4] = scoreDiff;
      }
    }

    this.writeCookie( rows.map( e=>[e[2],e[0], e[3]] ) );

    console.log( rows );
    standings.addRows( rows );

    let view = new google.visualization.DataView(standings);
    let table = new google.visualization.Table(
      document.getElementById("standings") );
    table.draw(view, {pageSize: 20});
  }

  writeCookie(standingsRows){
    let json = encodeURIComponent( JSON.stringify(standingsRows) );
    let len = json.length;
    const sizeLimit = 4000;
    let numChunk = Math.floor( (len+sizeLimit-1)/sizeLimit );
    const maxAge = 60*60*24*28;
    document.cookie = `numChunk-${this.taskId}=${numChunk}; max-age=${maxAge};`;
    for(let i=0; i<numChunk; i++){
      let s = json.slice(i*sizeLimit, (i+1)*sizeLimit);
      let key = `standings-${this.taskId}-${i}`;
      document.cookie = `${key}=${s}; max-age=${maxAge};`;
    }
  }

  getCookie(key){
    try{
      let cookieStr = document.cookie;
      let keyStart = cookieStr.indexOf( key + '=' ) + key.length + 1;
      let keyEnd = cookieStr.indexOf(';', keyStart );
      if( keyEnd == -1 ){
        return cookieStr.substring( keyStart );
      }else{
        return cookieStr.substring( keyStart, keyEnd );
      }
    }catch(e){
      return '';
    }
  }

  // [ [userName, rank, score] ]
  getPrevStandings(){
    try{
      let numChunk = Number( this.getCookie( `numChunk-${this.taskId}` ) );
      let tmp = '';
      for(let i=0; i<numChunk; i++){
        let s = this.getCookie( `standings-${this.taskId}-${i}` );
        tmp += s;
      }
      let json = decodeURIComponent( tmp );
      let arr = JSON.parse( json );
      let prev = {};
      arr.forEach( e=>{
        prev[ e[0] ] = e;
      });
      return prev;
    }catch(e){
      console.log(e);
      return {};
    }
  }

  drawChart(){
    let scoreData = this.scoreData;
    const numUsers = Object.keys(scoreData).length;
    let data = [];

    let rank = [];
    let timePoint = {};
    let maxTime = 0;
    Object.keys(scoreData).forEach( function(userName){
      let obj = scoreData[userName];
      let maxScore = 0;
      Object.keys(obj).forEach( function(score){
        let elapsed = Number(obj[score]) / 1000000000;
        const sec = elapsed % 60;
        const min = Math.floor(elapsed / 60);
        maxTime = Math.max(maxTime, min);
        maxScore = Math.max(maxScore, Number(score));
        // const hour = Math.ceil(min/60);
        const hour = Math.ceil(min/60);
        timePoint[hour] = true;
      });
      rank.push( [maxScore, userName] );
    });
    maxTime += 100;

    rank.sort( (a,b)=>a[0]>b[0]?-1:1 );
    timePoint = Object.keys(timePoint).map( t=>Number(t) ).sort( (a,b)=>a<b?-1:1 );
    let timePointKey = {};
    timePoint.forEach( (t,idx)=>{timePointKey[t] = idx;} );

    // scoreTable
    // +---------------------------
    // | time | user1 | user2 | ...
    // +------+-------+-------+----
    // |time1 |score1 |score1 | ...
    //
    let scoreTable = new Array( timePoint );
    for(let i=0; i<timePoint.length; i++){
      scoreTable[i] = new Array( numUsers + 1 );
      scoreTable[i].fill(0);
      scoreTable[i][0] = timePoint[i];
    }

    rank.forEach( function(user, idx){
      const userName = user[1];
      let tmp = [];
      let obj = scoreData[userName];
      Object.keys(obj).forEach( function(score){
        let elapsed = Number(obj[score]) / 1000000000;
        const sec = elapsed % 60;
        const min = Math.floor(elapsed / 60);
        // const hour = Math.ceil(min/60);
        const hour = Math.ceil(min/60);
        let row = timePointKey[hour];
        scoreTable[row][idx+1] = Number(score)/100;
      } );
      for(let i=1; i<scoreTable.length; i++){
        scoreTable[i][idx+1] = Math.max(scoreTable[i][idx+1], scoreTable[i-1][idx+1]);
      }
    });

    // rankTable
    // +---------------------------
    // | time | user1 | user2 | ...
    // +------+-------+-------+----
    // |time1 | rank1 | rank1 | ...
    //
    let rankTable = new Array( timePoint );
    for(let i=0; i<timePoint.length; i++){
      rankTable[i] = new Array( numUsers + 1 );
      rankTable[i].fill(0);
      rankTable[i][0] = timePoint[i];
    }
    for(let i=0; i<rankTable.length; i++){
      const arr = scoreTable[i].slice(1).map( (s,i)=>[s,i] ).sort( (a,b)=>a[0]>b[0]?-1:1 );
      arr.forEach( (e,r)=>{
        rankTable[i][e[1]+1] = r+1;
        if( r>0 && arr[r-1][0] == e[0] ){
          rankTable[i][e[1]+1] = rankTable[i][arr[r-1][1]+1];
        }
      } );
    }

    document.getElementById("unko").textContent = "drawing chart...";

    let rankPromise = new Promise( resolve=>{
      this.drawRankChartPlotly(rank, rankTable);
      resolve();
    } );

    let scorePromise = new Promise( resolve=>{
      this.drawScoreChartPlotly(rank, scoreTable);
      resolve();
    } );

    let scoreDistPromise = new Promise( resolve=>{
      this.drawScoreDistribution(scoreTable);
      resolve();
    } );

    Promise.all( [rankPromise, scorePromise, scoreDistPromise] ).then( ()=>{
      document.getElementById("unko").textContent = "";
    } );
  }

  drawRankChartPlotly(currentRank, rankTable){
    let traces = [];
    let x = rankTable.map( e=>e[0] );
    for(let i=1; i<rankTable[0].length; i++){
      traces.push({
        x: x,
        y: rankTable.map( e=>e[i] ),
        mode: 'lines',
        type: 'scatter',
        name: currentRank[i-1][1],
        opacity: 0.5,
        visible: i<=20 ? true : "legendonly",
      });
    }

    let layout = {
      xaxis: {
        title : 'Elapsed Time [hour]',
      },
      yaxis: {
        title : 'Rank',
        autorange: 'reversed',
      },
    };
    Plotly.plot( document.getElementById("rankChart"), {
      data:traces,
      layout:layout,
    } );
  }

  drawScoreChartPlotly(currentRank, scoreTable){
    let traces = [];
    let x = scoreTable.map( e=>e[0] );
    const maxScore = scoreTable[scoreTable.length-1][1];
    for(let i=1; i<scoreTable[0].length; i++){
      traces.push({
        x: x,
        y: scoreTable.map( e=>e[i] ),
        mode: 'lines',
        type: 'scatter',
        name: currentRank[i-1][1],
        opacity: 0.5,
        visible: i<=20 ? true : "legendonly",
      });
    }

    let layout = {
      xaxis: {
        title : 'Elapsed Time [hour]',
      },
      yaxis: {
        title : 'Score',
      },
    };
    Plotly.plot( document.getElementById("scoreChart"), {
      data:traces,
      layout:layout,
    } );
  }

  drawScoreDistribution(scoreTable){
    let now = scoreTable.length-1;
    let scores = scoreTable[now].slice(1).sort((a,b)=>{
      a < b ? -1 : a>b ? 1 : 0;
    });

    let traces = [
      {
        x: (new Array(scores.length)).fill(0).map((_, i)=>i+1),
        y: scores,
        type: 'bar',
      }
    ];

    let layout = {
      xaxis: {
        title: 'Rank',
      },
      yaxis: {
        title: 'Score',
      }
    };
    Plotly.plot( document.getElementById("scoreDistribution"), {
      data:traces,
      layout:layout,
    });
  }
}
