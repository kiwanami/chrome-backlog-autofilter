// Backlog Autofilter
//
// LICENSE
//    Copyright (c) 2011 Masashi Sakurai. All rights reserved.
//    http://www.opensource.org/licenses/mit-license.php
// 
// Time-stamp: <2012-01-25 23:27:34 sakurai>

function $ID(id) {
    return document.getElementById(id);
}

function $X(xpath, node) {
	node = node || document;
    var res = node.evaluate(xpath, node, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    var copy = [];
    for (var i=0, j=res.snapshotLength; i<j; i++) {
        copy.push(res.snapshotItem(i));
    }
    return copy;
}

function $$(tagName,cssClass) {
    return $X("//"+tagName+"[@class='"+cssClass+"']");
}

function ICON(path) {
	return chrome.extension.getURL(path);
}

function xmlhttpRequest(param) {
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function(data) {
		if (xhr.readyState == 4) {
			if (xhr.status == 200) {
				param.onload && param.onload(xhr);
			} else {
				param.onerror && param.onerror(xhr);
			}}};
	if (param.overrideMimeType) {
		xhr.overrideMimeType(param.overrideMimeType);
	}
	xhr.open(param.method, param.url, true);
	xhr.send(param.data);
}


//==================================================
//# Size Adjustment

function adjustClientSize() {
	var clientWidth  = window.innerWidth;
	var clientHeight = window.innerHeight;
	var tbodyHeight = clientHeight*0.75;

	$X("//table[contains(@class,'autofilter')]/tbody")[0].style.height = tbodyHeight+"px";

	var ths = $X("//table[contains(@class,'autofilter')]/thead/th");
	var tds = $X("//table[contains(@class,'autofilter')]/tbody/tr[1]/td");
	var tfs = $X("//table[contains(@class,'autofilter')]/tfoot/th");
	for(var i=0,j=ths.length,k=0; i<j; i++) {
		var td = tds[k];
		if (ths[i].style.display == 'none' || !td) {
			continue;
		}
		var w = td.offsetWidth-1;
		ths[i].style.width = w+"px";
		tfs[i].style.width = w+"px";
		k++;
	}
}

window.addEventListener('resize', adjustClientSize);


//==================================================
//# 基本改造

Array.prototype.deleteAt = function(index) { return this.splice(index,1);};
Array.prototype.copy = function() {return this.map(function(i){ return i;});};
Function.prototype.bind = function(obj) {
    var self = this;
    return function() {
        return self.apply(obj,arguments);
    };
};
String.prototype.trim = function() {
    return this.replace(/^\s*/,"").replace(/\s*$/,"");
};
var K = function(x){return x;};
var NOP = function() {};
function bind(obj,method) {
    return function() {
        return obj[method].apply(obj,arguments);
    };
}
function extend(subclass,superclass,members) {
    for(var i in superclass) {
        if (superclass[i] instanceof Function) {
            subclass[i] = superclass[i];
        }
    }
    if (members) {
        for(var i in members) {
            if (members[i] instanceof Function) {
                subclass[i] = members[i];
            }
        }
    }
}
// デフォルト値付きハッシュ
function DHash(h, defaultFunction) {
    this.hash = h;
    this.defaultFunction = defaultFunction;
}
DHash.prototype.v = function(c) {
    if (c in this.hash) return this.hash[c];
    if (this.defaultFunction) {
        return this.defaultFunction(c);
    } else {
        return undefined;
    }
};

// Element作成
function E(tag,attrs,children) {
    var elm = document.createElement(tag);
    for(var i in attrs) {
        if ("id className textContent".indexOf(i) >= 0) {
            elm[i] = attrs[i];
        } else {
            elm.setAttribute(i,attrs[i]);
        }
    }
    if (children) {
        for(var i=0;i<children.length;i++) {
            elm.appendChild(children[i]);
        }
    }
    return elm;
}

function TXT(content) {
    return document.createTextNode(content);
}

function cumulativeOffset(element) { // copied from prototype.js 1.5.0
    var valueT = 0, valueL = 0;
    do {
      valueT += element.offsetTop  || 0;
      valueL += element.offsetLeft || 0;
      element = element.offsetParent;
    } while (element);
    return [valueL, valueT];
}

/**
 逐次実行オブジェクト
 関数を追加していって、startとやると順番に実行する。
 関数間の値の引渡しは関与しない。クロージャー等で頑張ること。
*/
var FChain = {};
FChain.STOP_ON_EXCEPTION = new Object();
FChain.create = function() {
    var obj = { tasks: [] };
    obj.onException = function(e) { return FChain.STOP_ON_EXCEPTION;};
    obj.scheduleATask = function() {
        if (obj.tasks.length == 0) return;
        var t = obj.tasks.shift();
        if (!t) {
            obj.scheduleATask();
        } else {
            setTimeout(function() {
                try {
                    t(obj.scheduleATask);
                } catch (e) {
                    var er = obj.onException(e);
                    if (er === FChain.STOP_ON_EXCEPTION) {
                        return;
                    }
                    obj.scheduleATask();
                }
            },1);
        }
    };
    obj.start = obj.resume = function() {
        obj.scheduleATask();
    };
    // obj.add( some_function ) とすると、
    // try { some_function() } catch (e) { ... } do_next_task();
    // という形で呼ばれる。
    obj.add = function(t) {
        obj.tasks.push(function(callback) {
                try { t(); } catch (e) {
                if (!obj.force) {
                    obj.onException(e);
                    return;
                }
            }
            callback();
        });
    };
    // obj.addc( some_function ); とすると、 
    // some_function( do_next_task );
    // という形で呼ばれる。いろいろ引数がある場合はカリー化しておく。
    obj.addc = function(t) {
        obj.tasks.push(t);
    };
    return obj;
};

//==================================================
// 定数

var OPT_ALL          = -1;//すべて
var OPT_DESC         = -2;//降順ソート
var OPT_ASC          = -3;//昇順ソート
var OPT_NOT_EMPTY    = -4;//空白以外

var OPT_SEL_SELECTED_ITEMS     = 1;
var OPT_SEL_NOT_SELECTED_ITEMS = 2;
var OPT_SELECT_SHOWEN_ITEMS    = 3;
var OPT_SELECT_ALL_ITEMS       = 4;
var OPT_CLEAR_SHOWEN_ITEMS     = 5;
var OPT_CLEAR_ALL_ITEMS        = 6;


//==================================================
//# 処理開始用ボタン作成

addChangeViewButton();

function addChangeViewButton() {
    $X("//td[@class='ico']/a/span").forEach( function(i, index) {
        var t = i.innerHTML;
        i.parentNode.title = t;
        i.innerHTML = "";
    });
    var handler = waitForPreTasks;
    var elm = E("a",{href:"javascript:void(0)", textContent: "[AF]"});
    var parent = $$("td","ico")[0];
    elm.addEventListener("click", function(ev) {
        handler && handler();
    },false);
    parent.insertBefore(elm,parent.firstChild);
}

//==================================================
//# 並行処理待ち
// カスタム属性、バージョン一覧取ってきた後で buildTaskTable を実行する

var deferredTask = {
    preTasksNum: -1,
    nextTask: null,
    taskFinished: function() {
        this.preTasksNum--;
        if (this.preTasksNum == 0 && this.nextTask) {
            this.nextTask();
            this.nextTask = null;
        }
    }
};

// startPreTasks は AF ボタン押す前に処理開始しても良いようになっている
function waitForPreTasks() {
    startPreTasks();
    if (deferredTask.preTasksNum == 0) {
        buildTaskTable();
    } else {
        deferredTask.nextTask = buildTaskTable;
    }
}

function startPreTasks() {
    deferredTask.preTasksNum = 2;
    BacklogAPI.retrieveVersions(function(versions) {
        BacklogAPI.VERSIONS = versions;
        deferredTask.taskFinished();
    });
    BacklogAPI.retrieveCustomFields(function(fields) {
        BacklogAPI.CUSTOM_FIELDS = fields;                         
        deferredTask.taskFinished();
    });
}


//==================================================
//# Autofilter Table の構築の前準備とアクション用GUI作成

function buildTaskTable() {

    var components = 
        (function(){
             var container    = $ID("container");
             var pagerTables  = $X("//table[@class='pager']");
             var pagerTds     = $X("//table[@class='pager']//td");
             var ret = {
                 container    : container,
                 pagerTables  : pagerTables,
                 statusPanel  : pagerTds[0],
                 searchPanel  : pagerTds[1],
                 summaryPanel : pagerTds[2],
                 actionPanel  : pagerTds[3],
                 mainTable    : $ID("issues-table")
             };
             return ret;
         })();

    overrideContents();
    
    var afTable = new AFTable(components.mainTable,
                              components.statusPanel,
                              buildTableColumnModel(),
                              []);
    
    afTable.addUpdateListener(onTableUpdate);
    makeActionPanel();
    var searchForSummary = makeFindPanel();
    setupSettingMenu();
    includeCSS();
    loadTaskList();
    components.reloadTaskList = loadTaskList;
    var initialSetting = getLastSetting();
    
    function loadTaskList() {
        afTable.setBusyState(true);
		var imgurl = ICON("icons/loading.gif");
        components.statusPanel.innerHTML = "[ 読み込み中 ... <img src='"+imgurl+"' /> ]";
        retrieveTaskObjectList( 
            function(taskList){
                components.statusPanel.innerHTML = "[ 処理中 ...  <img src='"+imgurl+"' /> ]";
                afTable.updateTaskList(taskList);
                if (initialSetting) {
                    afTable.setTableStatus(initialSetting);
                    initialSetting = null;
                }
                afTable.setBusyState(false);
            });
    }

    function includeCSS() {
        var link = E("link", {
            href     :"/styles/common/loom.R20081128.css",
            rel  : "stylesheet",
            type     : "text/css",
            charset : "utf-8"});
        var head = document.getElementsByTagName('head')[0];
        head.appendChild(link);
    }
    
    function overrideContents() {
        components.statusPanel.innerHTML  = "";
        components.summaryPanel.innerHTML = "";
        components.actionPanel.appendChild($ID("exportForm"));

        //ボタン消去
        $X("//td[@class='ico']/a").forEach( function(i, index) {
            i.style.display = "none";
        });

        // NAVIボタン
        var aa = $X("id('projectNav')//a");
		if (aa.length ==0) aa = $X("id('naviBar')//a");
        [
            E("span",{textContent:" "}),
            E("a",{href:aa[0].href,textContent:"[Home]",
                   id:"navi-home",title:"Home",target:"_blank"}),
            E("span",{textContent:" "}),
            E("a",{href:aa[2].href,textContent:"[Add]",
                   id:"navi-add",title:"課題追加",target:"_blank"}),
            E("span",{textContent:" "}),
            E("a",{href:aa[3].href,textContent:"[Wiki]",
                   id:"navi-wiki",title:"Wiki",target:"_blank"})
        ].forEach(function(item,index) {
            components.actionPanel.appendChild(item);
        });
        
        //全画面乗っ取り
        components.container.innerHTML = "";
        components.container.appendChild( components.pagerTables[0] );
        components.container.appendChild( components.mainTable );
        components.container.appendChild( components.pagerTables[1] );
    }
    
    function setupSettingMenu() {
        //設定ボタン
        var img = E("img",{src:ICON("icons/ico_management_gear.png"),alt:"表示設定"});
        var a = E("a",{href:"javascript:void(0);",alt:"表示設定"},[img]);
        components.actionPanel.appendChild(a);
        components.settingButton = a;
        a.addEventListener("click", function(ev) {
            showTableSettingMenu(ev,components,afTable);
        },false);
    }
    
    function makeFindPanel() {
        //# インクリメンタル検索機能
        var model = {
            searchText: "",
            searchItems: [],
            setText: function(t) {
                this.searchText = t;
                var samples = t.split(/[ 　]/);//全角と半角
                this.searchItems = [];
                for(var i=0;i<samples.length;i++) {
                    var a = samples[i];
                    if ((!a) || a.length == 0) continue;
                    this.searchItems.push(a);
                }
            },
            test: function(obj) {
                //全部含むときに真
                for(var k=0;k<this.searchItems.length;k++) {
                    var a = this.searchItems[k];
                    if (obj.summary.indexOf(a) == -1 && 
                        obj.description.indexOf(a) == -1) {
                        return false;
                    }
                }
                return true;
            },
            title: function() {
                if (this.searchItems.length == 0) return null;
                return "検索:["+this.searchText+"]";
            }
        };
        
        var findField = E("input", {type:"text", size: "16"});
        findField.value = "";
        var searchPanel = components.searchPanel;
        searchPanel.innerHTML = "isearch:";
        searchPanel.appendChild( findField );
        afTable.setExternalFilter(model);
        setInterval( function searchInterval() {
            var t = findField.value;
            if (model.searchText != t) {
                model.setText(t);
                afTable.updateTableView();
            }
        },800);
        return model;
    }

    function makeActionPanel() {
        var statusPanel = components.statusPanel;
        var actionPanel = components.actionPanel;

        var reload = E("button",{textContent: "reload"});
        reload.addEventListener("click",loadTaskList, false);
        actionPanel.insertBefore(reload, actionPanel.firstChild);
        
        var exportElm = E("button",{textContent: "export"});
        exportElm.addEventListener("click", function(ev) {
            ev.stopPropagation();
            exportTableTSV(components,afTable);
        }, false);
        actionPanel.insertBefore(exportElm, actionPanel.firstChild);
        
        var popup = E("input",{type:"checkbox",id:"popup-switch"});
        popup.addEventListener( "change",function(ev) {
            afTable.setPopupEnable(popup.checked);
        },false);
        actionPanel.insertBefore(
            E("label",{}, [popup,TXT(":popup ")]),
            actionPanel.firstChild);

        var report = E("input",{type:"checkbox",id:"report-switch"});
        report.addEventListener( "change",function(ev) {
            afTable.setReportEnable(report.checked);
        },false);
        actionPanel.insertBefore(
            E("label",{}, [report,TXT(":report ")]),
            actionPanel.firstChild);
        
        components.summaryPanel.appendChild(E("span",{textContent: "一括変更:"}));
        [ {text:"状態",      action:execActionChangeStatus},
          {text:"担当者",    action:execActionChangeAssigner},
          {text:"マイルストーン", action:execActionChangeMilestone},
          {text:"カテゴリー", action:execActionChangeCategory},
          {text:"種別", action:execActionChangeIssueType},
          {text:"優先度",    action:execActionChangePriority},
          {text:"期限日",    action:execActionChangeLimit} ].forEach(
              function(item,index) {
                  var elm = E("button",{textContent: item.text});
                  elm.addEventListener(
                      "click",function(ev) { item.action(ev,components,afTable); },false);
                  components.summaryPanel.appendChild(elm);
              });
    }

    // 現在の検索条件でタスクの一覧を取得してリストにする
    // @param callback( alistOfBacklogTasks );
    function retrieveTaskObjectList(callback) {
        xmlhttpRequest({
            method: 'get',
            url: BacklogHTML.getCSVURL(),
            overrideMimeType: document.contentType+"; charset=Windows-31J",
            onload: function(details){
                callback( buildTaskList(details.responseText) );
            }
        });
        
        function buildTaskList(text) {
            var list = [];
            var src = text.split(/\n/);
            var mapper = BacklogTask.makeCSVMapper(src[0]);
            for(var i=1;i<src.length;i++) {
                var line = src[i];
                if (!line || line.length === 0) continue;
                list.push(BacklogTask.initByCSV(line,mapper));
            }
            list.sort(function(a,b) {return a.id - b.id;});
            return list;
        }
    }


    function buildTableColumnModel() {
        //# 各カラムごとの違いなどを構築
        // ※ BacklogTask 定義も参照
        var templateMap = new DHash(
                { //表示用のテンプレート
                    keyName: function() {
                        return "<a href=\"/PreViewIssue.action?key="+this.keyName+"\" target=\"_blank\">"+this.keyName+"</a>";
                    },
                    statusName: function() {
                        return "<div class=\"issue-status-"+this.statusId+"\">"+this.statusName+"</div>";
                    },
                    priorityName: function() {
                        return "<img src=\""+
							ICON("icons/icon_priority_"+this.priorityId+".png")+
							"\"/><span class=\"invisible\">"+this.priorityName+"</span>";
                    }
                });

        var sortMap = new DHash(
                { //名前でなくてIDで並べたい
                    keyName      : "keyId",
                    statusName   : "statusId",
                    priorityName : "priorityId"
                },K);

        var classMap = new DHash(
            { //表示用のクラスは別名
                issueTypeName : "issue-type",
                summary       : "title",
                version       : "affected_version",
                milestone     : "fixed_version",
                createdUser   : "user",
                assigner      : "user"
            },function(i) { return i.replace("Name","");});
        
        var filterMap = new DHash(
            { //各カラムに独自のフィルター項目を追加する場合
                statusName:[
                    new CustomFilterOption("完了以外", -10, function(i) { return i != "完了"; })
                ]
            });
        
        // 複数選択リスト項目
        var nameGetter = function(obj) { return obj.name; };
        var multiListValues = {
            versionName: BacklogAPI.VERSIONS.map(nameGetter),
            milestoneName: BacklogAPI.VERSIONS.map(nameGetter)
        };
        
        // カスタムフィールド設定追加
        BacklogAPI.CUSTOM_FIELDS.forEach( function(item, index) {
            BacklogTask.addCustomColumn(item.name,item.name,true);
            // 複数リスト追加
            if (item.type_id == BacklogAPI.CUSTOM_FIELD_TYPES.MULTI_SELECT) {
                multiListValues[item.name] = item.items.map(nameGetter);
            }
            // 統計の種類を判定
            BacklogTask.reportStrategies[item.name] = 
                BacklogAPI.CUSTOM_FIELD_TYPES_REPORT[""+item.type_id];
        });

        //表示するカラム
        var tableColumnModel = new TableColumnModel(BacklogTask.displayColumnIds);
        //デフォルトで表示しないカラム
        var defaultOffColumns = "startDate estimatedHours actualHours".split(" ");

        tableColumnModel.each(
            function( columnId, model ) {
                var pClassName = "p_"+columnId.replace("Name","");//表示制御用
                var className  = classMap.v(columnId);//レイアウト用

                model.thId         = "th-"+pClassName;
                model.tfId         = "tf-"+pClassName;
                model.thClassName  = pClassName;
                model.tdClassName  = className+" "+pClassName;
                model.columnName   = BacklogTask.cmap[columnId];
                model.sortColumnId = sortMap.v(columnId);
                model.dataTemplate = templateMap.v(columnId);
                model.visible      = (defaultOffColumns.indexOf(columnId) == -1);
                model.multiListValues = multiListValues[columnId];
                model.reportStrategy = BacklogTask.reportStrategies[columnId];
                
                if (filterMap.v(columnId)) {
                    filterMap.v(columnId).forEach(
                        function(item,index) {
                            model.customFilterOptions.push(item);
                        });
                }
            });
        
        return tableColumnModel;
    }
}


//==================================================
//# Autofilterの部品

// AutoFilterの動作の元になるカラムごとの設定をまとめたクラス
//     columnId ... TableModel のカラムを識別するID
//   カラムの並び順
//   各カラムのID、名前、CSSの定義
//   カスタムフィルターの定義
function TableColumnModel(_columnIds) {
    var self = this;
    
    var columnIds = _columnIds; // カラムの表示順序
    var columnModels = {};      // カラムの中身 columnId -> model
    
    function ColumnModel(_columnId) {
        this.columnId            = _columnId; // カラム識別用の内部ID
        this.columnName          = _columnId; // thに表示するタイトル
        
        this.thId                = _columnId; // th(thead)に付加するHTMLのID
        this.tfId                = _columnId; // th(tfoot)に付加するHTMLのID
        this.tdClassName         = _columnId; // td用のクラス
        this.thClassName         = _columnId; // th用のクラス
        
        this.sortColumnId        = _columnId; // ソートに使用するカラムID
        this.customFilterOptions = [];    // フィルターメニューに特注で追加する機能
        this.dataTemplate        = null;  // tdをレイアウトするときに使用するテンプレート
        
        this.visible             = true;  // このカラムを表示するかどうか
        this.multiListValues     = null;  // 文字列のリスト→複数選択リスト項目なのでレイアウト変更したり、選択項目を付け加える
        this.reportStrategy     = null;  // 簡易統計用関数。 {map: func, reduce: func} のオブジェクト。 null なら簡易統計は何もしない。
    }
    //public: カラムの表示用HTMLを返す
    ColumnModel.prototype.getListHTML = function(obj) {
        if (this.dataTemplate) {
            return this.dataTemplate.call(obj);
        } else {
            var data = obj[this.columnId];
            if  (data === undefined || data === null) return "";
            return (this.multiListValues) ? data.replace(/,/g, "<br />") : data;
        }
    };
    //public: このカラムのカスタム選択項目を option_id で検索する。
    ColumnModel.prototype.getCustomOptionById = function(optionId) {
        var ret = null;
        this.customFilterOptions.forEach(
            function(item,index) {
                if (item.optionId === optionId) {
                    ret = item;
                }
            });
        return ret;
    };
    //public: このカラムのデフォルトのフィルター用関数を返す
    ColumnModel.prototype.getDefaultFilterFunction = function() {
        // this.value はフィルターで選択された値
        return (this.multiListValues) ? 
            function(i) { return i.indexOf(this.value)>=0; } :
            function(i) { return i === this.value; };
    };

    columnIds.forEach(
        function(i,index) {
            columnModels[i] = new ColumnModel(i);
        });

    //public: 設定保存用
    this.getModelStatus = function () {
        var ret = {};
        this.each(function(columnId,cmodel) {
                      ret[columnId] = {visible: cmodel.visible};
                 });
        return ret;
    };
    //public: 設定読み込み用
    this.setModelStatus = function (data) {
        if (!data) return;
        this.each(function(columnId,cmodel) {
                      if(data[columnId]) {
                          cmodel.visible = data[columnId].visible;
                      }
                  });
    };
    
    //順不同
    this.getColumnModels = function() {
        return columnModels;
    };

    //順番は保存
    this.getColumnIds = function() {
        return columnIds;
    };
    
    //順番維持したままループ
    this.each = function( f ) { // f(columnId, columnModel)
        for(var i=0;i<columnIds.length;i++) {
            var c = columnIds[i];
            var item = columnModels[c];
            f(c,item);
        }
    };

    //指定カラムのモデルを取得。ソート用のカラムIDでも取れる。
    this.getColumnModel = function(columnId) {
        var ret = columnModels[columnId];
        if (ret) return ret;
        for(var i in columnModels) {
            var m = columnModels[i];
            if (m.sortColumnId === columnId) {
                ret = m;
            }
        }
        return ret;
    };
}

// 追加のフィルターメニュー機能
//   filterTitle: メニューに表示される名前
//   optionId:    selectやこのオブジェクトを識別するID（各カラムで一意）
//   testFunc:    フィルター関数: false を返すと削られる
function CustomFilterOption(filterTitle,optionId,testFunc) {
    this.filterTitle = filterTitle;
    this.optionId = optionId;
    this.testFunc = testFunc;
}


//# 表示からカラム設定用の簡易ダイアログ表示
function showTableSettingMenu(event, components, afTable) {
    var self = this;
    var menuElm = $ID("columns-select-menu");
    if (menuElm) {
        document.body.removeChild(menuElm);
    }
    
    menuElm = E("div",{id: "column-select-menu", className:"loom"});
    var tbody = components.mainTable.getElementsByTagName("tbody")[0];
    var pos = cumulativeOffset(tbody);
    var size = {w: tbody.offsetWidth, h: tbody.offsetHeight};
    size.innerWidth = size.w*0.8;
    size.space = size.w*0.1;
    menuElm.style.left = (pos[0]+size.space)+"px";
    menuElm.style.top  = (pos[1]+20)+"px";
    menuElm.style.width = size.innerWidth+"px";
    menuElm.appendChild(E("h4",{textContent:"カラムの表示設定"}));
    menuElm.addEventListener("click",function(ev) {ev.stopPropagation();},false);
    
    var columnsDiv = E("div");
    var columnModel = afTable.getTableColumnModel();
    var checkboxMap = {};//columnId -> checkbox
    columnModel.each(
        function(columnId,cmodel) {
            var check = E("input",{type:"checkbox"});
            var cdiv = E("div",{className:"column-select-column-div"},
                         [check,TXT(" : "+cmodel.columnName)]);
            columnsDiv.appendChild(cdiv);
            checkboxMap[columnId] = check;
            cdiv.addEventListener("click",
                      function(ev) {
                          cmodel.visible = !cmodel.visible;
                          updateCheckboxes(columnId);
                          ev.stopPropagation();
                      },true);
        });
    menuElm.appendChild(columnsDiv);
    
    menuElm.appendChild(E("br"));
    var closeButton = E("button",{textContent:"閉じる"});
    closeButton.addEventListener("click",
                    function(ev) { clearMenu(); },false);
    menuElm.appendChild(E("div",{style:"margin-top:20px; text-align:center;"},[closeButton]));

    document.body.appendChild(menuElm);
    updateCheckboxes();

    document.body.addEventListener("click",clearMenu,false);
    event.stopPropagation();
    
    function updateCheckboxes(hintColumnId) {
        columnModel.each(
            function(columnsId,cmodel) {
                checkboxMap[columnsId].checked = cmodel.visible;
            });
        if (hintColumnId) { //hintがある場合は更新する
            afTable.updateTableView();
        }
    }
    
    function clearMenu() {
        document.body.removeEventListener("click",clearMenu,false);
        try {
            document.body.removeChild(menuElm);
        } catch (e) { }//もみ消し
    }
}

function serializeKey() {
    return "taskview-"+BacklogHTML.getProjectKey();
}

function onTableUpdate(afTable) {
    var str = JSON.stringify(afTable.getTableStatus());
    localStorage.setItem(serializeKey(), str);
}

function getLastSetting() {
    return JSON.parse(localStorage.getItem(serializeKey()));
}


//==================================================
//#  まとめ処理

// まとめ処理用ダイアログ
// 例：
//    var dialog = new ActionDialog(components,afTable);
//    if (!dialog.validate) return;
//    dialog.title = function(task) { ... } //表示方法
//    dialog.form = formElm; //フォーム突っ込む
//    dialog.onOk = function() { ... } 
//       //trueで閉じる、falseで閉じない
//    dialog.show();

function ActionDialog(components,afTable) {
    var self = this;
    this.validate = true;
    this.components = components;
    this.afTable = afTable;
    
    this.tasks = afTable.getSelectedTasks();
    if (this.tasks.length == 0) {
        alert("タスクが選ばれていません。");
        this.validate = false;
        return;
    }
}
ActionDialog.prototype.show = function() {
    var self = this;
    var dialogElm = $ID('dialog-div');
    if (dialogElm) {
        document.body.removeChild(dialogElm);
    }
    
    //外側ダイアログ作成
    dialogElm = E("div",{id: "dialog-div",className:"loom"});
    var tbody = this.components.mainTable.getElementsByTagName("tbody")[0];
    var pos = cumulativeOffset(tbody);
    var size = {w: tbody.offsetWidth, h: tbody.offsetHeight};
    size.innerWidth = size.w*0.75;
    size.innerHeight = size.h*0.70;
    size.space = size.w/2 - size.innerWidth/2;
    dialogElm.style.left = (pos[0]+size.space)+"px";
    dialogElm.style.top  = (pos[1]+20)+"px";
    dialogElm.style.width = size.innerWidth+"px";
    dialogElm.style.height = size.innerHeight+"px";
    dialogElm.appendChild(E("h3",{textContent:self.title}));
    dialogElm.addEventListener("click",function(ev) {ev.stopPropagation();},false);
    
    //タスク一覧
    var taskListElm = E("div",{className:"taskList"});
    dialogElm.appendChild(taskListElm);
    taskListElm.appendChild(E("h4",{textContent:"対象タスク："+this.tasks.length+"件"}));
    var ulElm = E("ul");
    this.tasks.forEach(
        function(task,index) {
            ulElm.appendChild(E("li",{textContent:self.taskView(task)}));
        });
    taskListElm.appendChild(ulElm);

    //フォーム画面
    var formElm = E("div",{className:"form"});
    formElm.appendChild(E("h4",{textContent:"更新情報"}));
    var tableElm = E("table");
    var form = E("form",{},[tableElm]);
    formElm.appendChild(form);
    function addRow(title,elm) {
        var tr = E("tr",{},[ E("td",{},[TXT(title)]), E("td",{},[elm]) ]);
        tableElm.appendChild(tr);
    }
    this.form(formElm,addRow);
    
    // OK and cancel
    var buttonPanel = E("div",{className:"dialog-button-panel"});
    var okButton = E("button",{textContent:"　　登録　　"});
    okButton.addEventListener("click",
                 function(ev) {
                     // onOk は true で閉じる
                     // false だと閉じない(バリデーションなどで利用)
                     if (self.onOk) {
                         if (self.onOk()) {
                             clearDialog();
                         }
                     } else {
                         clearDialog();
                     }
                     ev.stopPropagation();
                 },false);
    buttonPanel.appendChild(okButton);
    var cancelButton = E("button",{textContent:" キャンセル "});
    cancelButton.addEventListener("click",
                     function(ev) {
                         clearDialog();
                     },false);
    buttonPanel.appendChild(cancelButton);
    formElm.appendChild(buttonPanel);
    dialogElm.appendChild(formElm);
    
    document.body.appendChild(dialogElm);
    document.body.addEventListener(
        "click",
        function(ev) { // カレンダークリックでダイアログが閉じないようにする
            function searchCalDiv(node) {
                if (node.className == "calendar") {
                    ev.stopPropagation();
                    return true;
                }
                if (node.parentNode) {
                    return searchCalDiv(node.parentNode);
                }
                return false;
            }
            // クリックされたのがカレンダーの中だったら閉じない
            if (!searchCalDiv(ev.target)) {
                clearDialog();
            }
        },false);
    function clearDialog() {
        document.body.removeEventListener("click",clearDialog,false);
        try {
            document.body.removeChild(dialogElm);
        } catch (e) { }//もみ消し
    }
};

function execActionChangeStatus(event,components,afTable) {
    event.stopPropagation();
    var dialog = new ActionDialog(components,afTable);
    if (!dialog.validate) return;

    dialog.title = "タスクの状態変更";
    dialog.taskView = function(task){
        return task.keyName+" : "+task.summary+" ("+task.statusName+")";
    };
    //フォーム画面
    var statusOptions,assignerElm,resolutionElm,commentElm;
    dialog.form = function(formElm,addRow) {
        statusOptions = BacklogAPI.STATUSES.map(
            function (item) {
                return E("label",{},
                         [ E("input",{type:"radio",name:"status",value:item.id}),
                           TXT(item.name) 
                         ]);
            });
        addRow("状態：",E("div",{}, statusOptions));
        assignerElm = E("select",{name:"assigner"},[]);
        addRow("担当者：",assignerElm);
        BacklogAPI.retrieveUsers(
            function(userList) {
                assignerElm.appendChild(E("option",{textContent:"[ 変更しない ]", value:"-1"}));
                for (var i = 0; i < userList.length; i++) {
                    var user = userList[i];
                    assignerElm.appendChild(E("option",{textContent:user.name, value:user.id}));
                }
            });
        resolutionElm =E("select",{name:"resolution"},[]);
        addRow("完了理由：",resolutionElm);
        resolutionElm.appendChild(E("option",{textContent:"[ 変更しない ]",value:"-1"}));
        for (var i = 0; i < BacklogAPI.RESOLUTIONS.length; i++) {
            var res = BacklogAPI.RESOLUTIONS[i];
            resolutionElm.appendChild(E("option",{textContent:res.name, value:res.id}));
        }
        commentElm = E("textarea",{name:"comment",rows:5},[]);
        addRow("コメント：",commentElm);
    };
    
    dialog.onOk = function() {
        var param = {};
        var statusId = -1;
        for (var i=0; i<statusOptions.length; i++) {
			var c = statusOptions[i];
            if (!c.tagName) continue;
            var chk = c.getElementsByTagName("input")[0];
            if (chk.checked) {
                statusId = parseInt(chk.value,10);
                break;
            }
        }
        if (statusId < 0) {
            alert("状態を選んでください");
            return false;
        }
        param.statusId = statusId;
        var userId = parseInt(assignerElm.value,10);
        if (userId > 0) param.assignerId = userId;
        var resId = parseInt(resolutionElm.value,10);
        if (resId > 0) param.resolutionId = resId;
        var comment = commentElm.value;
        if (comment && comment.length > 0) param.comment = comment;
        
        var fchain = FChain.create();
        var waitDlg = new WaitDialog("状態変更中・・・", dialog.tasks.length);
        dialog.tasks.forEach(
            function(item,index) {
                fchain.addc(
                    function(doNext) {
                        param.key = item.keyName;
                        BacklogAPI.changeTaskStatus(
                            param,function(res) {
                                waitDlg.step();
                                doNext();
                            });
                });
            });
        fchain.add(function() {waitDlg.close();});
        fchain.add(components.reloadTaskList);
        fchain.onException = function(e) {
            waitDlg.close();
            console.log("fchain error: %o",e);
            alert("タスク処理中にエラーになりました。\n処理を中断しましたので、内容を確認してください。\n"+e);
            return FChain.STOP_ON_EXCEPTION;
        };
        fchain.start();
        return true;
    };
    dialog.show();
}

function execActionChangeAssigner(event,components,afTable) {
    event.stopPropagation();
    var dialog = new ActionDialog(components,afTable);
    if (!dialog.validate) return;

    dialog.title = "タスクの担当者変更";
    dialog.taskView = function(task){
        return task.keyName+" : "+task.summary+" ("+task.assignerName+")";
    };
    //フォーム画面
    var assignerElm,commentElm;
    dialog.form = function(formElm,addRow) {
        assignerElm = E("select",{name:"assigner"},[]);
        addRow("担当者：",assignerElm);
        BacklogAPI.retrieveUsers(
            function(userList) {
                assignerElm.appendChild(E("option",{textContent:"[空にする]", value:"-1"}));
                for (var i = 0; i < userList.length; i++) {
                    var user = userList[i];
                    assignerElm.appendChild(E("option",{textContent:user.name, value:user.id}));
                }
            });
        commentElm = E("textarea",{name:"comment",rows:5},[]);
        addRow("コメント：",commentElm);
    };
    
    dialog.onOk = function() {
        var param = {};
        var userId = parseInt(assignerElm.value,10);
        if (userId > 0) {
            param.assignerId = userId;
        } else {
            //担当者を空にする
            param.assignerId = "";
        }
        var comment = commentElm.value;
        if (comment && comment.length > 0) param.comment = comment;
        
        var fchain = FChain.create();
        var waitDlg = new WaitDialog("担当者変更中・・・", dialog.tasks.length);
        dialog.tasks.forEach(
            function(item,index) {
                fchain.addc(
                    function(doNext) {
                        param.key = item.keyName;
                        BacklogAPI.changeTaskData(
                            param,function(res) {
                                waitDlg.step();
                                doNext();
                            });
                });
            });
        fchain.add(function() {waitDlg.close();});
        fchain.add(components.reloadTaskList);
        fchain.onException = function(e) {
            waitDlg.close();
            console.log("fchain error: %o",e);
            alert("タスク処理中にエラーになりました。\n処理を中断しましたので、内容を確認してください。\n"+e);
            return FChain.STOP_ON_EXCEPTION;
        };
        fchain.start();
        return true;
    };
    dialog.show();
}

function execActionChangeMilestone(event,components,afTable) {
    event.stopPropagation();
    var dialog = new ActionDialog(components,afTable);
    if (!dialog.validate) return;

    dialog.title = "タスクのマイルストーン変更";
    dialog.taskView = function(task){
        return task.keyName+" : "+task.summary+" ("+(task.milestoneName||"なし")+")";
    };
    //フォーム画面
    var milestoneElm,commentElm;
    dialog.form = function(formElm,addRow) {
        milestoneElm = E("select",{name:"milestone"},[]);
        addRow("マイルストーン：",milestoneElm);
        BacklogAPI.retrieveVersions(
            function(versionList) {
                milestoneElm.appendChild(E("option",{textContent:"[空にする]", value:"-1"}));
                for (var i = 0; i < versionList.length; i++) {
                    var v = versionList[i];
                    milestoneElm.appendChild(E("option",{textContent:v.name, value:v.id}));
                }
            });
        commentElm = E("textarea",{name:"comment",rows:5},[]);
        addRow("コメント：",commentElm);
    };
    
    dialog.onOk = function() {
        var param = {};
        var userId = parseInt(milestoneElm.value,10);
        if (userId > 0) {
            param.milestoneId = userId;
        } else {
            //マイルストーンを空にする
            param.milestoneId = null;
        }
        var comment = commentElm.value;
        if (comment && comment.length > 0) param.comment = comment;
        
        var fchain = FChain.create();
        var waitDlg = new WaitDialog("マイルストーン変更中・・・", dialog.tasks.length);
        dialog.tasks.forEach(
            function(item,index) {
                fchain.addc(
                    function(doNext) {
                        param.key = item.keyName;
                        BacklogAPI.changeTaskData(
                            param,function(res) {
                                waitDlg.step();
                                doNext();
                            });
                });
            });
        fchain.add(function() {waitDlg.close();});
        fchain.add(components.reloadTaskList);
        fchain.onException = function(e) {
            waitDlg.close();
            console.log("fchain error: %o",e);
            alert("タスク処理中にエラーになりました。\n処理を中断しましたので、内容を確認してください。\n"+e);
            return FChain.STOP_ON_EXCEPTION;
        };
        fchain.start();
        return true;
    };
    dialog.show();
}

function execActionChangeCategory(event,components,afTable) {
    event.stopPropagation();
    var dialog = new ActionDialog(components,afTable);
    if (!dialog.validate) return;

    dialog.title = "タスクのカテゴリー変更";
    dialog.taskView = function(task){
        return task.keyName+" : "+task.summary+" ("+(task.componentName||"なし")+")";
    };
    //フォーム画面
    var categoryElm,commentElm;
    dialog.form = function(formElm,addRow) {
        categoryElm = E("select",{name:"category"},[]);
        addRow("カテゴリー：",categoryElm);
        BacklogAPI.retrieveComponents(
            function(categoryList) {
                categoryElm.appendChild(E("option",{textContent:"[空にする]", value:"-1"}));
                for (var i = 0; i < categoryList.length; i++) {
                    var v = categoryList[i];
                    categoryElm.appendChild(E("option",{textContent:v.name, value:v.id}));
                }
            });
        commentElm = E("textarea",{name:"comment",rows:5},[]);
        addRow("コメント：",commentElm);
    };
    
    dialog.onOk = function() {
        var param = {};
        var categoryId = parseInt(categoryElm.value,10);
        if (categoryId > 0) {
            param.componentId = categoryId;
        } else {
            //カテゴリーを空にする
            param.componentId = null;
        }
        var comment = commentElm.value;
        if (comment && comment.length > 0) param.comment = comment;
        
        var fchain = FChain.create();
        var waitDlg = new WaitDialog("カテゴリー変更中・・・", dialog.tasks.length);
        dialog.tasks.forEach(
            function(item,index) {
                fchain.addc(
                    function(doNext) {
                        param.key = item.keyName;
                        BacklogAPI.changeTaskData(
                            param,function(res) {
                                waitDlg.step();
                                doNext();
                            });
                });
            });
        fchain.add(function() {waitDlg.close();});
        fchain.add(components.reloadTaskList);
        fchain.onException = function(e) {
            waitDlg.close();
            console.log("fchain error: %o",e);
            alert("タスク処理中にエラーになりました。\n処理を中断しましたので、内容を確認してください。\n"+e);
            return FChain.STOP_ON_EXCEPTION;
        };
        fchain.start();
        return true;
    };
    dialog.show();
}

function execActionChangeLimit(event,components,afTable) {
    event.stopPropagation();
    var dialog = new ActionDialog(components,afTable);
    if (!dialog.validate) return;

    dialog.title = "タスクの期限日変更";
    dialog.taskView = function(task){
        return task.keyName+" : "+task.summary+" ("+(task.limitDate||"なし")+")";
    };
    //フォーム画面
    var limitElm,commentElm;
    dialog.form = function(formElm,addRow) {
        limitElm = E("input",{type:"text",name:"limitDate",id:"limitDate",size:10});
        var spanElm = E("span");
        spanElm.innerHTML = "<a href='javascript:void(0);' id='limitDateCalendar'><img src='"+ICON("icons/ico_calendar02.gif")+"' alt='' /><span>カレンダーから選択</span></a>";
        spanElm.insertBefore(limitElm,spanElm.firstChild);
        addRow("期限日：",spanElm);
        commentElm = E("textarea",{name:"comment",rows:5},[]);
        addRow("コメント：",commentElm);
    };

    dialog.onOk = function() {
        var param = {};
        var datef = limitElm.value;
        if (datef.match(/[0-9]{4}\/?[0-9]{2}\/?[0-9]{2}/)) {
            param.due_date = datef.replace(/\//g,"");
        } else {
            //期限日を空にする
            param.due_date = "";
        }
        var comment = commentElm.value;
        if (comment && comment.length > 0) param.comment = comment;
        
        var fchain = FChain.create();
        var waitDlg = new WaitDialog("期限日変更中・・・", dialog.tasks.length);
        dialog.tasks.forEach(
            function(item,index) {
                fchain.addc(
                    function(doNext) {
                        param.key = item.keyName;
                        BacklogAPI.changeTaskData(
                            param,function(res) {
                                waitDlg.step();
                                doNext();
                            });
                });
            });
        fchain.add(function() {waitDlg.close();});
        fchain.add(components.reloadTaskList);
        fchain.onException = function(e) {
            waitDlg.close();
            console.log("fchain error: %o",e);
            alert("タスク処理中にエラーになりました。\n処理を中断しましたので、内容を確認してください。\n"+e);
            return FChain.STOP_ON_EXCEPTION;
        };
        fchain.start();
        return true;
    };
    dialog.show();

    Calendar.setup({
        inputField  : "limitDate",
        ifFormat    : "%Y/%m/%d",
        showsTime   : false,
        button      : "limitDateCalendar",
        align       : "Bl",
        singleClick : true,
        weekNumbers : false
    });
}

function execActionChangePriority(event,components,afTable) {
    event.stopPropagation();
    var dialog = new ActionDialog(components,afTable);
    if (!dialog.validate) return;

    dialog.title = "タスクの優先度変更";
    dialog.taskView = function(task){
        return task.keyName+" : "+task.summary+" ("+task.priorityName+")";
    };
    //フォーム画面
    var priorityElm,commentElm;
    dialog.form = function(formElm,addRow) {
        priorityElm = E("select",{name:"priority"},[]);
        addRow("優先度：",priorityElm);
        priorityElm.appendChild(E("option",{textContent:"[ 未設定 ]",value:"-1"}));
        for (var i = 0; i < BacklogAPI.PRIORITIES.length; i++) {
            var res = BacklogAPI.PRIORITIES[i];
            priorityElm.appendChild(E("option",{textContent:res.name, value:res.id}));
        }
        commentElm = E("textarea",{name:"comment",rows:5},[]);
        addRow("コメント：",commentElm);
    };
    
    dialog.onOk = function() {
        var param = {};
        var priorityId = parseInt(priorityElm.value,10);
        if (priorityId > 0) {
            param.priorityId = priorityId;
        } else {
            alert("新しい優先度を設定してください。");
            return false;
        }
        var comment = commentElm.value;
        if (comment && comment.length > 0) param.comment = comment;
        
        var fchain = FChain.create();
        var waitDlg = new WaitDialog("優先度変更中・・・", dialog.tasks.length);
        dialog.tasks.forEach(
            function(item,index) {
                fchain.addc(
                    function(doNext) {
                        param.key = item.keyName;
                        BacklogAPI.changeTaskData(
                            param,function(res) {
                                waitDlg.step();
                                doNext();
                            });
					});
            });
        fchain.add(function() {waitDlg.close();});
        fchain.add(components.reloadTaskList);
        fchain.onException = function(e) {
            waitDlg.close();
            console.log("fchain error: %o",e);
            alert("タスク処理中にエラーになりました。\n処理を中断しましたので、内容を確認してください。\n"+e);
            return FChain.STOP_ON_EXCEPTION;
        };
        fchain.start();
        return true;
    };
    dialog.show();
}

function execActionChangeIssueType(event,components,afTable) {
    event.stopPropagation();
    var dialog = new ActionDialog(components,afTable);
    if (!dialog.validate) return;

    dialog.title = "タスクの種別変更";
    dialog.taskView = function(task){
        return task.keyName+" : "+task.summary+" ("+task.issueTypeName+")";
    };
    //フォーム画面
    var issueTypeElm,commentElm;
    dialog.form = function(formElm,addRow) {
        issueTypeElm = E("select",{name:"issueType"},[]);
        addRow("種別：",issueTypeElm);
        BacklogAPI.retrieveIssueTypes(
            function(issueTypeList) {
                for (var i = 0; i < issueTypeList.length; i++) {
                    var v = issueTypeList[i];
                    issueTypeElm.appendChild(E("option",{textContent:v.name, value:v.id}));
                }
            });
        commentElm = E("textarea",{name:"comment",rows:5},[]);
        addRow("コメント：",commentElm);
    };
    
    dialog.onOk = function() {
        var param = {};
        var issueTypeId = parseInt(issueTypeElm.value,10);
        if (issueTypeId > 0) {
            param.issueTypeId = issueTypeId;
        } else {
            alert("新しい種別を設定してください。");
            return false;
        }
        var comment = commentElm.value;
        if (comment && comment.length > 0) param.comment = comment;
        
        var fchain = FChain.create();
        var waitDlg = new WaitDialog("種別変更中・・・", dialog.tasks.length);
        dialog.tasks.forEach(
            function(item,index) {
                fchain.addc(
                    function(doNext) {
                        param.key = item.keyName;
                        BacklogAPI.changeTaskData(
                            param,function(res) {
                                waitDlg.step();
                                doNext();
                            });
					});
            });
        fchain.add(function() {waitDlg.close();});
        fchain.add(components.reloadTaskList);
        fchain.onException = function(e) {
            waitDlg.close();
            console.log("fchain error: %o",e);
            alert("タスク処理中にエラーになりました。\n処理を中断しましたので、内容を確認してください。\n"+e);
            return FChain.STOP_ON_EXCEPTION;
        };
        fchain.start();
        return true;
    };
    dialog.show();
}

function exportTableTSV(components, afTable) {
    var ret = [];
    var tableRows = afTable.getTableDataAsCells();
    for (var i=0;i<tableRows.length;i++) {
        var cols = tableRows[i];
        ret.push(cols.join("\t"));
    }
    var text = ret.join("\n");
    
    //以下のべた書きを何とかしたい
    var dialogElm = E("div",{id: "dialog-div",className:"loom"});
    var tbody = components.mainTable.getElementsByTagName("tbody")[0];
    var pos = cumulativeOffset(tbody);
    var size = {w: tbody.offsetWidth, h: tbody.offsetHeight};
    size.innerWidth = size.w*0.75;
    size.innerHeight = size.h*0.65;
    size.space = size.w/2 - size.innerWidth/2;
    dialogElm.style.left = (pos[0]+size.space)+"px";
    dialogElm.style.top  = (pos[1]+20)+"px";
    dialogElm.style.width = size.innerWidth+"px";
    dialogElm.style.height = size.innerHeight+"px";
    dialogElm.appendChild(E("h3",{textContent:"タブ区切りでエクスポート"}));
    dialogElm.addEventListener("click",function(ev) {ev.stopPropagation();},false);

    dialogElm.appendChild(E("span",{textContent:"コピーしてExcelに貼り付けてください。"}));
    var textArea = E("textarea",{name:"copy", rows:5, cols:80});
    textArea.value = text;
    dialogElm.appendChild(textArea);
    
    var buttonPanel = E("div",{className:"dialog-button-panel"});
    var cancelButton = E("button",{textContent:"   閉じる   "});
    cancelButton.addEventListener("click",
								  function(ev) {
									  clearDialog();
								  },false);
    buttonPanel.appendChild(cancelButton);
    dialogElm.appendChild(buttonPanel);

    document.body.appendChild(dialogElm);
    document.body.addEventListener("click", function(ev) { clearDialog(); } ,false);
    
    function clearDialog() {
        document.body.removeEventListener("click",clearDialog,false);
        try {
            document.body.removeChild(dialogElm);
        } catch (e) { }//もみ消し
    }
}


//==================================================
//#  Wait dialog

function WaitDialog(title, countNum) {
    var self = this;

    //以前のゴミ削除
    var bgElm = $ID('wait-background-div');
    bgElm && document.body.removeChild(bgElm);
    var dialogElm = $ID('wait-dialog-div');
    dialogElm && document.body.removeChild(dialogElm);
    
    //サイズ計算
    var size = {w: window.innerWidth, h: window.innerHeight};
    size.innerWidth = size.w*0.5;
    size.innerHeight = 100;
    size.space = size.w/2 - size.innerWidth/2;

    //背景作成
    bgElm = E("div",{id: "wait-background-div"});
    bgElm.style.left = "0px";
    bgElm.style.top = "0px";
    bgElm.style.width = size.w+"px";
    bgElm.style.height = size.h+"px";

    //表のダイアログ
    dialogElm = E("div",{id: "wait-dialog-div"});
    dialogElm.style.left = size.space+"px";
    dialogElm.style.top  = (size.h/2 - size.innerHeight/2)+"px";
    dialogElm.style.width = size.innerWidth+"px";
    dialogElm.style.height = size.innerHeight+"px";
    
    //プログレスバーコンポーネントにしたい
    var progressbarElm = E("div",{className:"progressbar"});
    var progressElm = E("div",{className:"progress"});
    progressElm.style.width = "0px";
    var progressLabelElm = E("div",{className: "progress-label",textContent:"0 %"});
    
    //組み立て
    document.body.appendChild(bgElm);
    document.body.appendChild(dialogElm);
    dialogElm.appendChild(E("h3",{textContent: title}));
    dialogElm.appendChild(progressbarElm);
    progressbarElm.appendChild(progressElm);
    progressbarElm.appendChild(progressLabelElm);
    progressLabelElm.style.left = (progressbarElm.offsetWidth/2-progressLabelElm.offsetWidth/2)+"px";

    this.bgElm = bgElm;
    this.dialogElm = dialogElm;
    this.progressElm = progressElm;
    this.progressLabelElm = progressLabelElm;
    this.counterWidth = progressbarElm.offsetWidth;
    this.countNum = countNum;
    this.counter = 0;
}
WaitDialog.prototype.step = function() {
    this.counter += 1;
    this.progressElm.style.width = (this.counterWidth * this.counter/this.countNum)+"px";
    this.progressLabelElm.textContent = (Math.floor(100*this.counter/this.countNum))+" %";
}
WaitDialog.prototype.close = function() {
    document.body.removeChild(this.bgElm);
    document.body.removeChild(this.dialogElm);
}


//==================================================
//#  Autofilter Table class

function AFTable(_tableElm, _statusElm, _tableColumnModel, _taskList) {
    var afTable = this;

    var taskList = _taskList;
    function getTaskById(id) {
        if ( typeof(id) == "string" || id instanceof String) {
            id = parseInt(id,10);
        }
        for(var i=0;i<taskList.length;i++) {
            if (taskList[i].id == id) {
                return taskList[i];
            }
        }
        return null;
    }

    var tableColumnModel = _tableColumnModel; // 列の情報のまとめ
    this.getTableColumnModel = function() {
        return tableColumnModel;
    };

    // elements
    var statusElm = _statusElm; // 現在の検索条件などを表示する領域
    var tableElm = _tableElm;   // このautofilterが取り付くテーブル
    var theadElm, tbodyElm;     // ヘッダーと表の本体
    var tfootElm;  // 簡易集計用

	
    //#=====(状態管理)========================================
    // 参照：THメニュー、Popup
    var TSAbstract = {
        onClickTHColumn: NOP,
        onClickTHSelection: NOP,
        canShowPopup: function() { return false; },
        transState: function(nextState) { 
            tableState = nextState;
        }
    };
    
    //通常状態
    function TSNormal() {}
    extend(TSNormal.prototype, TSAbstract, {
        //thがクリックされたときに呼ばれる
        onClickTHColumn: function onClickTHColumn(event,columnId) {
            showTHColumnMenu(event,columnId);
        },
        //選択列をクリックされたとき
        onClickTHSelection: function onClickTHSelection(event) {
            showTHSelectionMenu(event);
        },
        canShowPopup: function() { return true; }
    });
    
    //THのautofilterのメニューを出している状態
    function TSTHMenu(menuManager,columnId) {
        this.menuManager = menuManager;
        this.columnId = columnId;//nullの場合selection
        this.startTime = new Date();
    }
    extend(TSTHMenu.prototype, TSAbstract, {
        isDoubleClick: function() {
            var now = new Date();
            //500msecでダブルクリック認定
            return ( (now.getTime() - this.startTime.getTime()) < 500 );
        },
        onClickTHColumn: function onClickTHColumn(event, columnId) {
            if (this.columnId != columnId) {
                showTHColumnMenu(event,columnId);
            } else {
                if (this.isDoubleClick()) {
                    execDoubleClickAction(this.menuManager);
                } else {
                    this.menuManager.finishMenu();
                    tableState.transState(new TSNormal());
                }
                event.stopPropagation();
            }
        },
        onClickTHSelection: function onClickTHSelection(event, columnId) {
            if (columnId) {
                showTHSelectionMenu(event);
            } else {
                if (this.isDoubleClick()) {
                    execDoubleClickAction(this.menuManager);
                } else {
                    this.menuManager.finishMenu();
                    tableState.transState(new TSNormal());
                }
                event.stopPropagation();
            }
        }
    });
    
    //busy状態
    function TSBusy() {}
    extend(TSBusy.prototype, TSAbstract, { });
    
    var tableState = new TSNormal();

	
    //#=====(テーブル初期化)========================================
    function setupTable() {
        if (tableElm.className.indexOf("autofilter") == -1) {
            tableElm.className += " autofilter";
        }
        tableElm.innerHTML = "";
        var ths = [], tfs = [];

        var sel = E("th",{id:"th-selection",className:"p_selection",textContent:"■"});
        sel.addEventListener("click",function(ev) {
            tableState.onClickTHSelection(ev);
        },false);
        ths.push(sel);
        tfs.push(E("th"));

        tableColumnModel.each(function(columnId,model) {
            var th = E("th",
                       {className: model.thClassName,
                        nowrap: "nowrap",
                        id: model.thId
                       });
            th.textContent = model.columnName;
            th.addEventListener("click",function(ev) {
                tableState.onClickTHColumn(ev,columnId);
            },false);
            ths.push(th);
            var tf = E("th",{className: model.thClassName, id: model.tfId});
            tfs.push(tf);
        });

        tfs.push(E("th"));

        theadElm = E("thead",{},ths);
        tableElm.appendChild(theadElm);
        tbodyElm = E("tbody",{});
        tableElm.appendChild(tbodyElm);
        tfootElm = E("tfoot",{},tfs);
        tableElm.appendChild(tfootElm);
        tfootElm.addEventListener("click", function(ev) {
            reportManager.onClickRow();
        },false);
    }
    setupTable();

	
    //#=====(ソート管理)========================================
    var sortModel = {
        keys:[], //sort用に {key:columnId,way:OPT_ASC,DESC} のオブジェクトを入れる
        getModelStatus: function() {
            return this.keys;
        },
        setModelStatus: function(data) {
            this.keys = data;
        },
        clear:function() { this.keys = []; },
        getIndex:function(key) {
            key = tableColumnModel.getColumnModel(key).sortColumnId;
            var keys = this.keys;
            for(var i=0;i<keys.length;i++) {
                if (keys[i].key == key) {
                    return i;
                }
            }
            return -1;
        },
        add:function(key,way) { // way: OPT_ASC, OPT_DESC
            key = tableColumnModel.getColumnModel(key).sortColumnId;
            var i = this.getIndex(key);
            if(i >= 0) {
                this.keys.deleteAt(i);
            }
            this.keys.push({key:key,way:way});
        },
        remove:function(key) {
            key = tableColumnModel.getColumnModel(key).sortColumnId;
            var i = this.getIndex(key);
            if(i >= 0) {
                this.keys.deleteAt(i);
            }
        },
        sort: function(taskList) {
            var keys = this.keys;
            if (keys.length == 0) return taskList;
            taskList.sort(//意外に遅くない
                function(t1,t2) {
                    for(var i=0;i<keys.length;i++) {
                        var sortInfo = keys[i];
                        var negtive = (sortInfo.way == OPT_ASC) ? -1 : 1;
                        var v1 = t1[sortInfo.key], v2 = t2[sortInfo.key];
                        if (v1 == v2) continue;
                        else return (v1 < v2) ? negtive : -negtive;
                    }
                    return 0;
                });
            return taskList;
        },
        summary: function() {
            if (this.keys.length === 0) return "";
            return "[ sort: "+
                this.keys.map(
                    function(i){
                        var w = (i.way == OPT_DESC) ? "↑" : "↓";
                        return tableColumnModel.getColumnModel(i.key).columnName + w;
                    }).join(" / ")+"  ]";
        }
    };

	
    //#=====(カラム、フィルター管理)========================================
    var filterModel = {
        columns: (function() {
            var model = {};
            tableColumnModel.each(
                function(columnId,columnModel) {
                    model[columnId] = {
                        values: [], //カラム内の値一覧（AF用）
                        filter: null, //AF用フィルター候補
                        //nullですべて, filter用インタフェース(test,title)
                        th: $ID(columnModel.thId),
                        tf: $ID(columnModel.tfId)
                    };
                });
            return model;
        })(),
        selectionFilter: null, //チェックボックスによるフィルター
        externalFilter: null,  //外部フィルター
        getModelStatus: function() {
            var self = this;
            var ret = {}; //{columnId: {value:(value), optionId:(optionId)}, ... }
            tableColumnModel.each(
                function(columnId,columnModel) {
                    var fv = self.columns[columnId].filter;
                    if (fv) {
                        if (fv.optionId < 0) {
                            ret[columnId] = { optionId: fv.optionId };
                        } else {
                            ret[columnId] = { value: fv.value };
                        }
                    }
                });
            if (self.selectionFilter) {
                ret.__selection__filter = {optionId: self.selectionFilter.optionId};
            }
            if (self.externalFilter) {
                //もし必要なら
            }
            return ret;
        },
        setModelStatus: function(data) { //更新はしない
            this.clear();
            //data = {columnId: {value:(value), optionId:(optionId)}, ... }
            tableColumnModel.each(
                function(columnId,columnModel) {
                    var d = data[columnId];
                    if (d) {
                        var actions = makeMenuActions( columnId );
                        if (d.optionId) {
                            findByOptionId(actions,d.optionId).perform(null);
                        } else {
                            findByValue(actions,d.value).perform(null);
                        }
                    }
                });
            if (data.__selectionFilter__) {
                this.selectionFilter = findByOptionId(makeSelectionMenuActions(),
                                                      data.__selectionFilter__.optionId);
            }
            function findByOptionId(actions,optionId) {
                for(var i=0;i<actions.length;i++) {
                    if (actions[i].optionId === optionId) {
                        return actions[i];
                    }
                }
                return {perform:K};
            }
            function findByValue(actions,value) {
                for(var i=0;i<actions.length;i++) {
                    if (actions[i].value === value) {
                        return actions[i];
                    }
                }
                return {perform:K};
            }
        },
        updateColumnValues: function(_taskList) {
            var self = this;
            tableColumnModel.each(
                function(columnId,columnModel) {
                    self.columns[columnId].values = 
                        (columnModel.multiListValues) ? 
                        getColumnValuesMultiList(columnModel) : getColumnValues(columnId);
                });
            // 重複を取り除いた一覧を返す
            function getColumnValues(cid) {
                var map = {}, list = [];
                for(var i=0;i<_taskList.length;i++) {
                    var v = _taskList[i][cid];
                    if (!(v in map)) {
                        map[v] = v;
                        list.push(v);
                    }
                }
                list.sort();
                return list;
            }
            // 複数リストの場合は元になるリストの値も使う
            function getColumnValuesMultiList(columnModel) {
                var values = getColumnValues(columnModel.columnId);
                var sample = values.join(" ");
                columnModel.multiListValues.forEach( function(item, index) {
                    if (sample.indexOf(item) >= 0 && values.indexOf(item) < 0) {
                        values.push(item);
                    }
                });
                values.sort();
                return values;
            }
        },
        existsBlank: function(columnId) {
            var ret = false;
            this.columns[columnId].values.forEach(function(i) {if (i == "") ret = true;});
            return ret;
        },
        clear: function() {
            var self = this;
            tableColumnModel.each(
                function(columnId,columnModel) {
                    self.columns[columnId].filter = null;
                });
        },
        filter: function(taskList) {
            var columnIds = tableColumnModel.getColumnIds();
            var filteredList = [];
            for(var i=0;i<taskList.length;i++) {
                if (isVisibleTask.call(this,taskList[i])) {
                    filteredList.push(taskList[i]);
                }
            }
            return filteredList;

            function isVisibleTask(task) {
                // 各カラムのフィルターが選択されているかどうかチェック
                for(var j=0;j<columnIds.length;j++) {
                    var cid = columnIds[j];
                    var fv = this.columns[cid].filter;
                    if (!fv) continue;
                    if (!fv.test(task[cid])) {
                        return false; // フィルターで弾かれたら×
                    }
                }
                // 選択フィルターで弾かれていたら×
                if (this.selectionFilter && !this.selectionFilter.test(task.id)) {
                    return false;
                }
                // 外部フィルター (isearch など) で弾かれていたら×
                if (this.externalFilter && !this.externalFilter.test(task)) {
                    return false;
                }
                return true; // 生き残ったもの
            }
        },
        updateThs: function() { //TRのクラスを現在の状態にあわせる
            var self = this;
            tableColumnModel.each(
                function(columnId,columnModel) {
                    var column = self.columns[columnId];
                    column.th.className =
                        [columnModel.thClassName,
                         (column.filter !== null) ? "autofilter-filter" : "",
                         (sortModel.getIndex(columnId) != -1) ? "autofilter-sort" : ""].join(" ");
                    if (columnModel.visible) {
                        column.th.style.display = "";
                        column.tf.style.display = "";
                    } else {
                        column.th.style.display = "none";
                        column.tf.style.display = "none";
                    }
                });
            
            var selectionTh = $ID("th-selection");
            selectionTh.className = ["p_selection", (self.selectionFilter) ? "autofilter-filter" : ""].join(" ");
        },
        summary: function() {
            var self = this;
            var list = [];
            tableColumnModel.each(
                function(columnId,columnModel) {
                    var fv = self.columns[columnId].filter;
                    if (fv !== null) {
                        list.push( columnModel.columnName+":"+fv.title );
                    }
                });
            if (self.selectionFilter) {
                list.push(self.selectionFilter.title);
            }
            if (self.externalFilter && self.externalFilter.title()) {
                list.push(self.externalFilter.title());
            }
            if (list.length === 0) return "";
            return "[ filter: "+list.join(" / ")+" ]";
        },
        setSelectionFilter: function(filter) {
            this.selectionFilter = filter;
        }
    };
    filterModel.updateColumnValues(taskList);
    
	
    //#=====(選択状態管理)========================================
    var selectionModel = {
        selectedTasks:{}, //taskListのidをキーにしたオブジェクト
        getModelStatus: function() {
            var ret = [];
            for(var i in this.selectedTasks) {
                ret.push(i);
            }
            return ret;
        },
        setModelStatus: function(data) {
            this.selectedTasks = {};
            for(var i=0;i<data.length;i++) {
                var task = getTaskById(data[i]);
                if (task) this.selectedTasks[data[i]] = task;
            }
        },
        getSelectedCount: function() {
            var count = 0;
            for(var i in this.selectedTasks) count++;
            return count;
        },
        select: function(ids) { //taskListのidか配列
            if (ids instanceof Array) {
                for(var i=0;i<ids.length;i++) {
                    this.selectedTasks[ids[i]] = getTaskById(ids[i]);
                }
            } else {
                this.selectedTasks[ids] = getTaskById(ids);
            }
        },
        remove: function(ids) {
            if (ids instanceof Array) {
                for(var i=0;i<ids.length;i++) {
                    delete this.selectedTasks[ids[i]];
                }
            } else {
                delete this.selectedTasks[ids];
            }
        },
        isSelected: function(id) {
            return !!this.selectedTasks[id];
        },
        isNotSelected: function(id) {
            return !this.isSelected(id);
        },
        // GUI関係 (onClickRow以外は基本的にGUIを自動で更新しない)
        // 行クリック
        onClickRow: function(task,checkboxElm) {
            if (!selectionModel.isSelected(task.id)) {
                this.select(task.id);
                checkboxElm.checked = true;
            } else {
                this.remove(task.id);
                checkboxElm.checked = false;
            }
            updateTableStatusElement();
        },
        // 見えているタスクのチェックボックス一覧に何かする
        //  block( checkbox, taskId(int) )
        _iterateShowedCheckboxes: function( block ) { 
            var checkboxes = tbodyElm.getElementsByTagName("input");
            for(var i=0;i<checkboxes.length;i++) {
                if (!checkboxes[i].id) continue;
                var m = checkboxes[i].id.match(/sel-(.+)/);
                if (m) {
                    var id = parseInt(m[1],10);
                    block(checkboxes[i],id);
                }
            }
        },
        // 見えているタスクだけクリア
        clearShowedTasks: function() {
            var self = this;
            this._iterateShowedCheckboxes(
                function(checkbox, id) { 
                    self.remove(id);
                });
        },
        // 見えているタスクだけチェック
        selectShowedTasks: function() {
            var self = this;
            this._iterateShowedCheckboxes(
                function(checkbox, id) { 
                    self.select(id);
                });
        },
        //THダブルクリックの処理
        reverseShowedTasks: function() { 
            //全部チェックされていたら消す。
            //それ以外の場合は全部チェックする
            var checkedAll = true;
            this._iterateShowedCheckboxes(
                function(checkbox, id) { 
                    checkedAll = checkedAll && checkbox.checked;
                });
            if (checkedAll) {
                this.clearShowedTasks();
            } else {
                this.selectShowedTasks();
            }
        },
        clearAll: function() {
            this.selectedTasks = {};
        },
        selectAll: function() {
            for(var i=0;i<taskList.length;i++) {
                this.select(taskList[i].id);
            }
        },
        updateSelectionFromModel: function() {
            var self = this;
            this._iterateShowedCheckboxes(
                function(checkbox, id) { 
                    checkbox.checked = self.isSelected(id);
                });
        },
        // taskListが更新されて、selectionModelの選択されていたリストを
        // アップデートする必要があるときに呼ばれる
        maintainSelectedTasks: function(taskList) {
            var removeList = [];
            for(var i in this.selectedTasks) {
                if (!_task(i)) {
                    removeList.push(i);
                }
            }
            this.remove(removeList);
            
            function _task(id) {
                id = parseInt(id,10);
                for(var i=0; i<taskList.length; i++) {
                    if (taskList[i].id == id) {
                        return taskList[i];
                    }
                }
                return null;
            }
        }
    };

    var updateListener = []; // このaftableの情報が更新されたときに呼ばれるイベントリスナー達

	
    //# AFTable public functions
    
    //public: 更新リスナー追加
    afTable.addUpdateListener = function(a) {
        if (a) {
            updateListener.push(a);
        }
    };

    function fireUpdateEvent() {
        if (!taskList || taskList.length == 0) return;
        updateListener.forEach(
            function(item,index) {
                item(afTable);
            });
    }
    
    //public: 現在のフィルターとソート設定をエクスポートする
    afTable.getTableStatus = function() {
        return {
            filter: filterModel.getModelStatus(),
            sort: sortModel.getModelStatus(),
            selection: selectionModel.getModelStatus(),
            columnModels: tableColumnModel.getModelStatus()
        };
    };

    //public: フィルターとソート設定をインポートする
    afTable.setTableStatus = function(data) {
        if (!data) return;
        tableColumnModel.setModelStatus(data.columnModels);
        filterModel.setModelStatus(data.filter);
        sortModel.setModelStatus(data.sort);
        selectionModel.setModelStatus(data.selection);
        afTable.updateTableView();
    };
    
    //public: table外部のフィルターを設定する（全文検索など）
    afTable.setExternalFilter = function(filter) {
        filterModel.externalFilter = filter;
    };
    
    //public: 現在選択されているタスクの一覧を返す
    afTable.getSelectedTasks = function() {
        var ret = [];
        for(var i in selectionModel.selectedTasks) {
            ret.push(getTaskById(i));
        }
        return ret;
    };

    //public: 引数のデータに変更して描画しなおす
    afTable.updateTaskList = function(newTaskList) {
        taskList = newTaskList;
        filterModel.updateColumnValues(taskList);
        selectionModel.maintainSelectedTasks(taskList);
        afTable.updateTableView();
    };
    
    //public: フィルター、ソートをクリアして再描画する
    afTable.clearFilters = function() {
        sortModel.clear();
        filterModel.clear();
        afTable.updateTableView();
    };
    
    //public: テーブルのbusy状態を切り替える
    afTable.setBusyState = function(isBusy) {
        if (isBusy) {
            tableState.transState( new TSBusy() );
        } else {
            tableState.transState( new TSNormal() );
        }
    };
    
    //public: 現在のフィルターとソート設定で内容を2次元配列に入れる
    afTable.getTableDataAsCells = function() {
        var sortedTaskList = sortModel.sort(filterModel.filter(taskList));
        var columnIds = tableColumnModel.getColumnIds();
        var rows = [];
        var dummyElm = E("div");
        
        var ths = ["選択"];
        tableColumnModel.each(
            function(columnId,model) {
                var cm = tableColumnModel.getColumnModel(columnId);
                if (!cm.visible) return;
                ths.push(model.columnName);
            });
        rows.push(ths);
        
        for(var i=0;i<sortedTaskList.length;i++) {
            var tds = [];
            var task = sortedTaskList[i];
            tds.push( selectionModel.isSelected(task.id) ? "○" : "" );
            for(var j=0;j<columnIds.length;j++) {
                var cid = columnIds[j];
                var cm = tableColumnModel.getColumnModel(cid);
                if (!cm.visible) continue;
                var td = E("td",{className: cm.tdClassName});
                dummyElm.innerHTML = cm.getListHTML(task);
                tds.push( dummyElm.textContent );
            }
            rows.push(tds);
        }
        return rows;
    };

    //public: 現在のフィルターなどの設定でテーブルを再描画
    afTable.updateTableView = function() {
        //prepare data
        var sortedTaskList = sortModel.sort(filterModel.filter(taskList));
        
        var columnIds = tableColumnModel.getColumnIds();

        //make rows
        var fragment = document.createDocumentFragment();
        for(var i=0;i<sortedTaskList.length;i++) {
            var tds = [];
            var task = sortedTaskList[i];

            var selectionElm = E("td",{className: "p_selection"});
            var selectionCheckElm = E("input",{id:"sel-"+task.id,type:"checkbox"});
            selectionElm.appendChild(selectionCheckElm);
            tds.push(selectionElm);

            for(var j=0;j<columnIds.length;j++) {
                var cid = columnIds[j];
                var cm = tableColumnModel.getColumnModel(cid);
                if (!cm.visible) continue;
                var td = E("td",{className: cm.tdClassName});
                td.innerHTML = cm.getListHTML(task);
                tds.push(td);
            }

            var tr = E("tr",{className: (i%2 === 0) ? "even" : "odd"},tds);
            tr.setAttribute("taskId",task.id);//for popup display
            with({task:task, checkboxElm:selectionCheckElm}) {
                tr.addEventListener("click",function(ev) {
                    if (ev.target && ev.target.href) {
                        return true;//リンクは何もしない
                    }
                    return selectionModel.onClickRow(task,checkboxElm);
                },false);
            }
            fragment.appendChild(tr);
        }

        tbodyElm.innerHTML = "";
        tbodyElm.appendChild(fragment);

        filterModel.updateThs();
        updateTableStatusElement();
        selectionModel.updateSelectionFromModel();
        reportManager.updateReports(sortedTaskList);
    };

    //テーブルのステータスを更新する時（再描画、選択変更）に呼ばれる
    function updateTableStatusElement() {
        var showCount = tbodyElm.getElementsByTagName("tr").length;
        statusElm.innerHTML =
            ["[ 表 ",showCount,
             " / 選 ",selectionModel.getSelectedCount(),
             " / 全 ",taskList.length," ]",
             "<span class=\"autofilter-status-filter\">",
             filterModel.summary(),"</span>",
             "<span class=\"autofilter-status-sort\">",
             sortModel.summary(),"</span>"].join(" ");
        
        //reset button
        var reset = E("button",{textContent: "[x]", title:"clear all filters"});
        reset.addEventListener("click", function(ev) { afTable.clearFilters();}, false);
        statusElm.appendChild(reset);

        fireUpdateEvent(); //ステータスが変わるような時はupdateされてると仮定
    }
    
	
    //==================================================
    //# Autofilterのメニュー関係

    //  フィルターの表示、動作に必要な情報を集めたクラス
    function ColumnFilter(columnId, optionId, value, title) {
        // カラムID
        this.columnId = columnId;
        // select の option の value の値。
        this.optionId = optionId;
        if (typeof(value) == "function") {
            this.test = value;
        } else {
            // フィルターで比較に使う値
            this.value = value;
            // 引数のオブジェクトを表示するかどうか。trueで表示。
            this.test = tableColumnModel.getColumnModel(columnId).getDefaultFilterFunction();
        }
        // ステータス表示に表示するもの。
        this.title = title;
    }
    function NotEmptyFilter(columnId) {
        this.columnId = columnId;
        this.optionId = OPT_NOT_EMPTY;
        this.test = function(i) {
            return i != "";
        };
        this.title = "空白以外";
    }

    // メニューの各項目の表示、動作に必要な情報をまとめたクラス
    // arg = {columnId, value, title, optionId, [action,isSelected]
    function AutofilterMenuAction(arg) {
        this.columnId = arg.columnId;
        this.value = arg.value;
        this.title = arg.title;
        this.optionId = arg.optionId;
        this.perform = arg.action || K;
        this.isSelected = arg.isSelected || K;
        var title = this.title;
        var model = tableColumnModel.getColumnModel(this.columnId);
        if (model && model.multiListValues) {
            title = title.replace(/,/g, " / ");
        }
        this.optionElm = 
            E("option",{value:this.optionId,
                        textContent:title,
                        title:title});
    }
    
    function MenuManager(thElm) {
        var self = this;
        var menuMargin = 35;
        var menuElm = $ID('column-menu');
        if (menuElm) {
            document.body.removeChild(menuElm);
        }
        menuElm = E("div",{id: "column-menu"});
        var pos = cumulativeOffset(thElm);
        if ( (pos[0]+thElm.offsetWidth+menuMargin) > tableElm.offsetWidth ) {
            pos[0] = pos[0] - menuMargin - 5;
        }
        menuElm.style.left = pos[0]+"px";
        menuElm.style.top  = (pos[1]+thElm.offsetHeight+1)+"px";
        var selectElm = E("select",{size:10});

        this.setWidth = function(width) {
            var menuWidth = width+"px";
            menuElm.style.width = menuWidth;
            selectElm.style.width = menuWidth;
        };
        this.setWidth(thElm.offsetWidth+35);

        menuElm.appendChild(selectElm);
        document.body.appendChild(menuElm);
        
        this.finishMenu = function() {
            self.closeDIV();
            tableState.transState(new TSNormal());
        };
        this.closeDIV = function() {
            document.body.removeEventListener("click",self.finishMenu,false);
            try {
                document.body.removeChild(menuElm);
            } catch (e) { }//もみ消し
        };
        this.doubleClickAction = NOP;
        
        document.body.addEventListener("click",this.finishMenu,false);
        
        var actionMap = []; // index -> action

        selectElm.addEventListener("change",onSelectOption,false);
        function onSelectOption(ev) {
            try {
                var action = actionMap[selectElm.selectedIndex];
                var leaveFlag = false;
                if (action) {
                    leaveFlag = action.perform(ev);
                }
                if (!leaveFlag) {
                    afTable.updateTableView();
                }
            } catch (e) {
                console.log(e);
            } finally {
                self.finishMenu();
                ev.stopPropagation();
            }
        }
        this.setActions = function(_actions,_doubleClickAction) {
            var selectedIndex = -1;
            _actions.forEach(
                function(item,index) {
                    selectElm.appendChild(item.optionElm);
                    actionMap.push(item);
                    if (item.optionId) {
                        if (selectedIndex == -1 && item.isSelected()) {
                            selectedIndex = index;
                        }
                    }
                });
            selectElm.selectedIndex = selectedIndex;
            selectElm.setAttribute("size",Math.min(10,_actions.length));
            if (_doubleClickAction) {
                this.doubleClickAction = _doubleClickAction;
            }
        };
    }

    //普通のthメニュー表示
    function showTHColumnMenu(event,columnId) {
        var fmodel = filterModel.columns[columnId];
        var menu = new MenuManager(fmodel.th);
        menu.setActions( makeMenuActions(columnId), function() {
            fmodel.filter = null;
            sortModel.remove(columnId);
            afTable.updateTableView();
        });
        tableState.transState(new TSTHMenu(menu,columnId));
        event.stopPropagation();//thで処理したので伝搬ストップ
        window.getSelection().removeAllRanges();
    }
    
    //選択列メニュー表示
    function showTHSelectionMenu(event) {
        var th = $ID("th-selection");
        var menu = new MenuManager(th);
        menu.setWidth(230);
        menu.setActions( makeSelectionMenuActions(), function() {
            selectionModel.reverseShowedTasks();
            selectionModel.updateSelectionFromModel();
            updateTableStatusElement();
        });
        tableState.transState(new TSTHMenu(menu,null));
        event.stopPropagation();//thで処理したので伝搬ストップ
        window.getSelection().removeAllRanges();
    }
    
    //THをダブルクリックされたとき
    function execDoubleClickAction(menuManager) {
        menuManager.finishMenu();
        menuManager.doubleClickAction();
        tableState.transState(new TSNormal());
        window.getSelection().removeAllRanges();
    }
    
    //指定した列のメニューActionの配列を作る
    function makeMenuActions(columnId) {
        var fmodel = filterModel.columns[columnId];
        var cmodel = tableColumnModel.getColumnModel(columnId);
        var actions = [];
        //   標準機能的項目
        actions.push(
            new AutofilterMenuAction(
                {
                    columnId:columnId, title:"[ すべて ]",
                    optionId:OPT_ALL,
                    action: function act(ev) {
                        fmodel.filter = null;
                        sortModel.remove(columnId);
                    },
                    isSelected: function isSelected() {
                        return (!fmodel.filter) && (sortModel.getIndex(columnId) == -1);
                    }
                }));
        // ソート
        [{title:"[ ↓昇順  ]",value:OPT_ASC}, {title:"[ ↑降順  ]",value:OPT_DESC}].forEach(
            function(item,index) {
                actions.push(
                    new AutofilterMenuAction(
                        {
                            columnId:columnId, title:item.title,
                            optionId:item.value,
                            action: function act(ev) {
                                if (!(fmodel.filter instanceof NotEmptyFilter)) {
                                    fmodel.filter = null;//[空白以外]は残していて良いかも
                                }
                                sortModel.add(columnId, item.value);
                            },
                            isSelected: function isSelected() {
                                var sortKeyIndex = sortModel.getIndex(columnId);
                                if (sortKeyIndex >= 0) {
                                    return sortModel.keys[sortKeyIndex].way == item.value;
                                }
                                return false;
                            }
                        }));
            });

        // 空白以外
        if (filterModel.existsBlank(columnId)) {
            actions.push(
                new AutofilterMenuAction(
                    {
                        columnId:columnId, title:"[空白以外]",
                        optionId:OPT_NOT_EMPTY,
                        action: function act(ev) {
                            fmodel.filter = new NotEmptyFilter(columnId);
                        },
                        isSelected: function isSelected() {
                            return fmodel.filter instanceof NotEmptyFilter;
                        }
                    }));
        }

        //中身のSELECTとOPTIONを用意
        //   自動で集めた項目
        fmodel.values.forEach(
            function(value,_index) {
                var index = _index+1;
                var title = (value == "") ? "[  空白  ]" : value;
                actions.push(
                    new AutofilterMenuAction({
                        columnId:columnId,value:value,
                        title:title,optionId:index,
                        action: function act(ev) {
                            fmodel.filter = new ColumnFilter(columnId,index,value,title);
                            sortModel.remove(columnId);
                        },
                        isSelected: function isSelected() {
                            return fmodel.filter && fmodel.filter.optionId === index;
                        }
                    }));
            });

        //   カスタム機能項目
        cmodel.customFilterOptions.forEach(
            function(item,index) {
                actions.push(
                    new AutofilterMenuAction(
                        {
                            columnId: columnId,
                            title: "["+item.filterTitle+"]",
                            optionId: item.optionId,
                            action: function act(ev) {
                                fmodel.filter = 
                                    new ColumnFilter(columnId,item.optionId,
                                                     item.testFunc,item.filterTitle);
                                sortModel.remove(columnId);
                            },
                            isSelected: function isSelected() {
                                return fmodel.filter && fmodel.filter.optionId === item.optionId;
                            }
                        }));
            });
        return actions;
    }
    
    //選択列のメニューActionの配列を作る
    function makeSelectionMenuActions() {
        var actions = [
            new AutofilterMenuAction({            
                title:"[  すべて  ]",
                optionId:OPT_ALL,
                action: function act(ev) {
                    filterModel.setSelectionFilter(null);
                },
                isSelected: function isSelected() {
                    return (filterModel.selectionFilter && filterModel.selectionFilter.optionId == OPT_ALL);
                }}),
            new AutofilterMenuAction({
                title:"[v]選択済み",optionId:OPT_SEL_SELECTED_ITEMS,
                action: function act(ev) {
                    filterModel.setSelectionFilter({title:"選択済",optionId:OPT_SEL_SELECTED_ITEMS,
                                                    test:bind(selectionModel,"isSelected")});
                },
                isSelected: function isSelected() {
                    return (filterModel.selectionFilter && filterModel.selectionFilter.optionId == OPT_SEL_SELECTED_ITEMS);
                }}),
            new AutofilterMenuAction({
                title:"[ ]非選択",optionId:OPT_SEL_NOT_SELECTED_ITEMS,
                action:function act(ev) {
                    filterModel.setSelectionFilter({title:"非選択",optionId:OPT_SEL_NOT_SELECTED_ITEMS,
                                                    test:bind(selectionModel,"isNotSelected")});
                },
                isSelected: function isSelected() {
                    return (filterModel.selectionFilter && filterModel.selectionFilter.optionId == OPT_SEL_NOT_SELECTED_ITEMS);
                }}),
            new AutofilterMenuAction({title:"----------"}),
            
            new AutofilterMenuAction({
                title:"●表示されているものにチェック",optionId:OPT_SELECT_SHOWEN_ITEMS,
                action:function act(ev) {
                    selectionModel.selectShowedTasks();
                    selectionModel.updateSelectionFromModel();
                    updateTableStatusElement();
                    return true;
                },
                isSelected:function isSelected() {
                    return (filterModel.selectionFilter && filterModel.selectionFilter.optionId == OPT_SELECT_SHOWEN_ITEMS);
                }}),
            new AutofilterMenuAction({
                title:"○表示されているものをクリア",optionId:OPT_CLEAR_SHOWEN_ITEMS,
                action:function act(ev) {
                    selectionModel.clearShowedTasks();
                    selectionModel.updateSelectionFromModel();
                    updateTableStatusElement();
                    return true;
                },
                isSelected:function isSelected() {
                    return (filterModel.selectionFilter && filterModel.selectionFilter.optionId == OPT_CLEAR_SHOWEN_ITEMS);
                }}),
            new AutofilterMenuAction({title:"----------"}),
            
            new AutofilterMenuAction({
                title:"■全部チェック",optionId:OPT_SELECT_ALL_ITEMS,
                action:function act(ev) {
                    selectionModel.selectAll();
                    selectionModel.updateSelectionFromModel();
                    updateTableStatusElement();
                    return true;
                },
                isSelected:function isSelected() {
                    return (filterModel.selectionFilter && filterModel.selectionFilter.optionId == OPT_SELECT_ALL_ITEMS);
                }}),
            new AutofilterMenuAction({
                title:"□全部クリア",optionId:OPT_CLEAR_ALL_ITEMS,
                action:function act(ev) {
                    selectionModel.clearAll();
                    selectionModel.updateSelectionFromModel();
                    updateTableStatusElement();
                    return true;
                },
                isSelected:function isSelected() {
                    return (filterModel.selectionFilter && filterModel.selectionFilter.optionId == OPT_CLEAR_ALL_ITEMS);
                }})];
        return actions;
    }
    
	
    //#====(集計関係)================================================

    var reportManager = new function ReportManager() {
        this.active = false;
		this.wide = false;

		// mouse hover event
        tableColumnModel.each(function( columnId, model ) {
            if (model.reportStrategy) {
                var elm = $ID(model.tfId);
				if (elm) {
					elm.addEventListener(
						"mouseover", function(ev) {
							showPopup(model);
						},false);
					elm.addEventListener(
						"mouseout", function(ev) {
							hidePopup();
						},false);
				}
			}});

		var popupElm = null;
		var showPopup = function(model) {
            if (!tableState.canShowPopup()) {
                //他の機能が動作中のときは出さない
                return;
            }
			var dataElm = $ID(model.tfId);
			if (!dataElm || !dataElm.data) return;
			var data = dataElm.data;//elementに値埋め込み
            if (popupElm) {
                document.body.removeChild(popupElm);
            }
            //Popupの外枠
            popupElm = E("div",{id: "popup-report"});
            var pos = cumulativeOffset(tbodyElm);
            var size = {w: tbodyElm.offsetWidth, h: tbodyElm.offsetHeight};
            size.innerWidth = size.w * 0.6;
            size.space = size.w * 0.04;
			// Title
            popupElm.appendChild(E("h4",{textContent:model.columnName}));
			// 内容はあとで入れる (jqplotがそうなっているので...)
            var chartElm = E("div",{id:"report-chart"});
            popupElm.appendChild(chartElm);
            // 位置計算
			var xx = dataElm.offsetLeft + dataElm.offsetWidth/2;
			xx = xx - size.innerWidth/2;
			if (xx < size.space) {
				xx = size.space;
			} else if (xx > (size.w - size.space - size.innerWidth)) {
				xx = (size.w - size.space - size.innerWidth);
			}
            popupElm.style.left = (pos[0] + xx)+"px";
            popupElm.style.top  = (pos[1]+10)+"px";
            popupElm.style.width = size.innerWidth+"px";
            // 表示
            document.body.appendChild(popupElm);

			var plot = jQuery.jqplot(
				'report-chart',
				[data.map(function(v) {return [v.key,v.count];})], {
					seriesDefaults: {
						renderer: jQuery.jqplot.PieRenderer,
						rendererOptions: {
							dataLabelPositionFactor: 0.74,
							startAngle: 270,
							showDataLabels: true,
							dataLabels: data.map(function(v) {return v.key+" "+v.count+v.unit;}),
						}
					},
					legend: {
						numberRows: 10,
						show:true,
						location: 'e' 
					}
				}
			);
		};
		var hidePopup = function() {
            if (popupElm) {
                document.body.removeChild(popupElm);
                popupElm = null;
            }
		};

        this.updateReports = function(tasklist) {
            if (!this.active) return;
            var models = [], data = [], ids = []; // 順番は維持
            tableColumnModel.each(function( columnId, model ) {
                if (model.reportStrategy) {
                    ids.push(columnId);
                    models.push(model);
                    data.push([]);
                }});
            var mnum = models.length;
            for (var i = 0; i < tasklist.length; i++) {
                var task = tasklist[i];
                for (var j = 0; j < mnum; j++) {
                    data[j].push( models[j].reportStrategy.map(ids[j], task) );
                }
            }
            for (var j = 0; j < mnum; j++) {
                var result = models[j].reportStrategy.reduce( data[j] );
				var resultStr = models[j].reportStrategy.format( result );
                var elm = $ID(models[j].tfId);
				if (result && result[0] && result[0]['key']) {
					elm.data = result; //集計だけ記録する
				}
                elm.innerHTML = resultStr.replace(/\n/g,"<br />");
                elm.title = resultStr.replace(/\n/g," / ");
            }
        };

		var footerHeight = 28;
		var footerWideHeight = 160;
		var updateStyleHeights = function (height) {
			var clientHeight = window.innerHeight*0.75;
            tfootElm.style.height = height+"px";
			tbodyElm.style.height = (clientHeight-height)+"px";
		};
		var self = this;
		this.updateElements = function () {
			adjustClientSize();
			if (self.active) {
				tfootElm.className = "";
				var th = $X("//table[contains(@class,'autofilter')]/tfoot/th")[0];
				var mh = (th && (th.offsetHeight < footerWideHeight)) ? th.offsetHeight : footerWideHeight;
				if (self.wide) {
					updateStyleHeights(mh);
				} else {
					updateStyleHeights(footerHeight);
				}
			} else {
				tfootElm.className = "hide";
				updateStyleHeights(0);
			}
		}
        
        this.enable = function() {
            this.wide = false;
            this.active = true;
			this.updateReports(sortModel.sort(filterModel.filter(taskList)));
			this.updateElements();
        };
        this.disable = function() {
            this.active = false;
			this.wide = false;
			this.updateElements();
        };

        this.onClickRow = function() {
            this.wide = !this.wide;
			this.updateElements();
        };

		afTable.addUpdateListener(this.updateElements);
    };

    reportManager.disable();

    afTable.setReportEnable = function(b) {
        if (b) reportManager.enable();
        else reportManager.disable();
    };

	
    //#====(ポップアップ関係)========================================

    var popupManager = new function PopupManager() {
        
        var currentTimeoutId = null;
        var popupTime = 500;//msec
        var currentMousePos = {x:0,y:0};
        var popupElm = null;
        
        var popupStates ={
            normal: {
                onTRMouseOut: function(ev,taskId) {
                    hidePopup();
                },
                onTRMouseOver: function(ev,taskId) {
                    currentMousePos.x = ev.clientX;
                    currentMousePos.y = ev.clientY;
                    if (taskId) {
                        showPopup(taskId);
                    }
                },
                onTableMouseOut: function(ev,taskId) {
                    hidePopup();
                }
            },
            hide: {
                onTRMouseOut: function(ev,taskId) {
                    hidePopup();
                },
                onTRMouseOver: function(ev,taskId) {
                    hidePopup();
                },
                onTableMouseOut: function(ev,taskId) {
                    hidePopup();
                }
            }
        };
        
        this.enable = function() {
            currentPopupState = popupStates.normal;
        };
        this.disable = function() {
            currentPopupState = popupStates.hide;
        };
        
        var currentPopupState = popupStates.hide;

        tableElm.addEventListener(
            "mouseout",
            function(ev) {
                var taskId = ev.target.parentNode.getAttribute("taskId");
                var targetTagName = ev.target.tagName.toLowerCase();
                if (targetTagName == "td") {
                    currentPopupState.onTRMouseOut(ev,taskId);
                } else if (targetTagName == "tbody") {
                    currentPopupState.onTableMouseOut(ev,taskId);
                }
            },false);
        
        tableElm.addEventListener(
            "mouseover",
            function(ev) {
                var taskId = ev.target.parentNode.getAttribute("taskId");
                var targetTagName = ev.target.tagName.toLowerCase();
                if (targetTagName == "td") {
                    currentPopupState.onTRMouseOver(ev,taskId);
                }
            },false);
        
        function showPopup(taskId) {
            if (!tableState.canShowPopup()) {
                //他の機能が動作中のときは出さない
                return;
            }
            var task = getTaskById(taskId);
            //前準備
            if (currentTimeoutId) {
                clearTimeout(currentTimeoutId);
                currentTimeoutId = null;
            }
            if (popupElm) {
                document.body.removeChild(popupElm);
            }
            //Popupの外枠
            popupElm = E("div",{id: "popup-taskview"});
            var pos = cumulativeOffset(tbodyElm);
            var size = {w: tbodyElm.offsetWidth, h: tbodyElm.offsetHeight};
            size.innerWidth = size.w * 0.45;
            size.space = size.w * 0.04;
            
            // 内容つくる ### taskの形に依存!!
            popupElm.appendChild(E("h4",{textContent:task.keyName+" : "+task.summary}));
            var descElm = E("div",{className:"loom"});
            descElm.innerHTML = task.getDescriptionHTML();
            popupElm.appendChild(descElm);
            // コメント追加
            function addComments() {
                popupElm.appendChild(E("hr"));
                if (!task.comments || task.comments.length == 0) {
                    popupElm.appendChild(E("div",{className:"loom",textContent:"No comments:"}));
                    return popupElm;
                }
                var commentsElm = E("div",{className:"loom"});
                task.comments.forEach(
                    function(item,index){
                        commentsElm.appendChild(
                            E("div",{},[
                                E("h5",{textContent:item.created_user.name+" | "+formatDate(item.created_on)}),
                                TXT(item.content)
                            ]));
                    });
                popupElm.appendChild(commentsElm);
                return commentsElm;
            }
            if (task.comments) {
                addComments();
            } else {
                currentTimeoutId = setTimeout(
                    function(){
                        BacklogAPI.retrieveComments(
                            taskId,function(list) {
                                task.comments = list;
                                var ce = addComments();
                                adjustPosition();
                                ce.focus();
                            });
                    },600);
            }
            
            // 位置計算
            if (currentMousePos.x > window.innerWidth/2) {
                popupElm.style.left = (pos[0] + size.space)+"px";
            } else {
                popupElm.style.left = (pos[0] + size.w - size.innerWidth - size.space)+"px";
            }
            if (currentMousePos.y > window.innerHeight/2) {
                popupElm.style.top  = (pos[1]+10)+"px";
            } else {
                popupElm.style.top = (pos[1] + size.h*0.6)+"px";
            }
            popupElm.style.width = size.innerWidth+"px";
            
            // 表示
            document.body.appendChild(popupElm);
            adjustPosition();

            function adjustPosition() {
                var ch = popupElm.offsetHeight;
                if (currentMousePos.y < window.innerHeight/2 && ch > size.h/2) {
                    popupElm.style.top = (pos[1] + size.h - size.h*0.65)+"px";
                    popupElm.style.height = size.h*0.6+"px";
                }
            }
        }
        
        function hidePopup() {
            if (currentTimeoutId) {
                clearTimeout(currentTimeoutId);
            }
            currentTimeoutId = setTimeout(
                function() {
                    if (popupElm) {
                        document.body.removeChild(popupElm);
                        popupElm = null;
                    }
                    currentTimeoutId = null;
                },500);
        }
    }; //popup

    afTable.setPopupEnable = function(b) {
        if (b) popupManager.enable();
        else popupManager.disable();
    };
    
    //==== go ahead

    afTable.updateTableView();
}


//==================================================
//#  BacklogTask class

// Backlog のタスクについてのドメイン知識はこのあたりに書く
// （逆に GUI に近い知識は buildTableColumnModel 関数に書く）

function BacklogTask() {}

// {key: , name: } の配列
BacklogTask.columnPairs = 
    (function() {
        var pairs = 
			["ID: id",
			 "プロジェクトID: projectId     ,プロジェクト名: projectName",
			 "キーID: keyId                 ,キー: keyName",
			 "種別ID: issueTypeId           ,種別: issueTypeName",
			 "カテゴリーID: componentId     ,カテゴリー名: componentName",
			 "バージョンID: versionId       ,バージョン: versionName",
			 "件名: summary                 ,詳細: description",
			 "状態ID: statusId              ,状態: statusName",
			 "優先度ID: priorityId          ,優先度: priorityName",
			 "マイルストーンID: milestoneId ,マイルストーン: milestoneName",
			 "完了理由ID: finishCauseId     ,完了理由: finishCauseName",
			 "担当者ID: assignerId          ,担当者: assignerName",
			 "作成者ID: createdUserId       ,作成者: createdUserName",
			 "作成日: created               ,更新日: updated",
			 "更新者ID: updatedUserId       ,更新者: updatedUserName",
			 "開始日: startDate             ,期限日: limitDate",
			 "予定時間: estimatedHours      ,実績時間: actualHours",
			 "コメント1: comment1           ,コメント2: comment2",
			 "コメント3: comment3           ,コメント4: comment4",
			 "コメント5: comment5           ,コメント6: comment6, コメント7: comment7"]
			.join(',').split(/[\n,]/).map(
				function(line) {
					var pair = line.split(/:/);
					if (!pair || pair.length < 2) return null;
					return { name: pair[0].trim(), key: pair[1].trim() };
				});
        var ret = [];
        pairs.forEach( function(item, index) {
            if (item) ret.push(item);
        });
        return ret;
    })();

// columnPairs から取ってくる
BacklogTask.columnNames = BacklogTask.columnPairs.map(function(i) { return i.name; });
BacklogTask.columnIds = BacklogTask.columnPairs.map(function(i) { return i.key; });
// columnPairs からこのアプリが表示して意味がありそうなもの
BacklogTask.displayColumnIds = "keyName issueTypeName componentName summary priorityName versionName milestoneName created startDate limitDate estimatedHours actualHours updated createdUserName assignerName statusName".split(" ");

// key -> name のマップ
BacklogTask.cmap = (function(){
    var map = {};
    for(var i=0;i<BacklogTask.columnIds.length;i++) {
        map[BacklogTask.columnIds[i]] = BacklogTask.columnNames[i];
    }
    return map;
})();

/**
 * columnPairs, columnIds, columnNames, cmap, displayColumnIds の整合性を取るために、
 * 基本フィールド以外のカスタムフィールドはこの関数を使って追加する。
 */
BacklogTask.addCustomColumn = function(id, name, displayFlag) {
    BacklogTask.columnPairs.push( { key:id, name: name} );
    BacklogTask.columnIds.push(id);
    BacklogTask.columnNames.push(name);
    BacklogTask.cmap[id] = name;
    if (displayFlag) BacklogTask.displayColumnIds.push(id);
}

BacklogTask.prototype.toString = function() {
    return "[TASK:"+this.id+"/"+this.summary+"]";
};
BacklogTask.prototype.getDescriptionHTML = function () {
    return this.description.replace(/\n/g,"<br />");
};

/**
 * CSVのヘッダーから、順番→プロパティ名を変換する
 * オブジェクトを返す
 */
BacklogTask.makeCSVMapper = function(header) {
    var pairs = BacklogTask.columnPairs;
    function searchByName(name) {
        for(var i=0,j=pairs.length; i<j; i++) {
            if (pairs[i].name == name) return pairs[i].key;
        }
        return null;
    }
    var cols = CSV.split(header);
    var colmap = []; // 順番 -> columnId
    cols.forEach( function(item, index) {
        colmap.push(searchByName(item));
    });
    return colmap;
};

BacklogTask.initByCSV = function(line,mapper) {
    var cols = CSV.split(line);
    var t = new BacklogTask();
    for(var i=0;i<mapper.length;i++) {
        t[mapper[i]] = cols[i];
    }
    for(var i in t) {
        if (i == "id" || i.match(/Id$/)) {
            t[i] = parseInt(t[i],10) || t[i];
        } else if (i.match(/Hours/)) {
			t[i] = parseFloat(t[i]) || t[i];
		}
    }
    t.description = t.description.replace(/\\\\r\\\n/g,"\n").replace(/\\\\r\\\\n/g,"\n");
    return t;
};

// 簡易統計の定義

BacklogTask.defaultReportStrategies = {
    sum: {
        map: function(key, task) {
            var h = task[key];
            return (h === null || h === undefined || h == "") ? null : parseInt(h,10);
        },
        reduce: function(values) {
            var sum = 0, count = 0;
            if (values) {
                for (var i=0,j=values.length; i<j; i++) {
                    if (values[i] !== null) {
                        count++;
                        sum += values[i];
                    }
                }
            }
            return {sum: sum ,count: count, total:values.length,unit:""};
        },
		format: function(values) {
            return "合計 "+values.sum+"\n[ "+values.count+" / "+values.total+" ]";
		}
	},
    sumFloat: {
        map: function(key, task) {
            var h = task[key];
            return (h === null || h === undefined || h == "") ? null : parseFloat(h);
        },
        reduce: function(values) {
            var sum = 0.0, count = 0;
            if (values) {
                for (var i=0,j=values.length; i<j; i++) {
                    if (values[i] !== null) {
                        count++;
                        sum += values[i];
                    }
                }
            }
            return {sum: sum ,count: count, total:values.length,unit:""};
        },
		format: function(values) {
            return "合計 "+values.sum+"\n[ "+values.count+" / "+values.total+" ]";
		}
	},
    count: {
        map: function(key, task) {
            var h = task[key];
            return (h == "" || h === null || h === undefined) ? null : h.replace(/,/g,"\n");
        },
        reduce: function(values) {
            var count = {}, keys = [];
            if (values) {
                for (var i=0,j=values.length; i<j; i++) {
                    var val = values[i];
                    if (val !== null) {
                        var cc = count[val]
                        if (cc) count[val] = cc+1;
                        else {
                            count[val] = 1;
                            keys.push(val);
                        }
                    }
                }
                keys.sort(function(i,j) { return count[j]-count[i]; });
                return keys.map(function(key) { return {key:key,count:count[key],unit:""};});
            }
            return null;
        },
		format: function(values) {
			if (!values) return "なし";
            return values.map(function(val) { return val.key+": "+val.count; }).join("\n");
		}
	},
    sumByPerson: {
        map: function(key, task) {
            var h = task[key];
            h = (h == "" || h === null || h === undefined) ? null : parseFloat(h);
			var name = task["assignerName"];
			return [name,h]; // return a tuple
        },
        reduce: function(values) {
            var counts = {}, sums = {}, keys = [];
            if (values) {
                for (var i=0,j=values.length; i<j; i++) {
                    var tuple = values[i];
					var name = tuple[0];
					var val = tuple[1];
                    if (val !== null) {
                        var cc = counts[name]
                        if (cc) {
							counts[name] = cc+1;
							sums[name] += val;
						} else {
                            counts[name] = 1;
							sums[name] = val;
                            keys.push(name);
                        }
                    }
                }
                keys.sort(function(i,j) { return sums[j]-sums[i]; });
                return keys.map(function(key) { 
					return {key:key, count:sums[key], unit:"h", rows:counts[key]};
				});
            }
            return null;
        },
		format: function(values) {
			if (!values) return "なし";
			var totalSum = 0;
			values.forEach( function(item, index) {
				totalSum += item.count;
			});
            return "合計:"+totalSum+"h\n"+values.map(function(val) {
				return val.key+": "+val.count+"h("+val.rows+")";
			}).join("\n");
		}
	}
};
BacklogTask.reportStrategies = {
    estimatedHours  : BacklogTask.defaultReportStrategies.sumByPerson,
    actualHours     : BacklogTask.defaultReportStrategies.sumByPerson,
    issueTypeName   : BacklogTask.defaultReportStrategies.count,
    statusName      : BacklogTask.defaultReportStrategies.count,
    priorityName    : BacklogTask.defaultReportStrategies.count,
    milestoneName   : BacklogTask.defaultReportStrategies.count,
    assignerName    : BacklogTask.defaultReportStrategies.count,
    finishCauseName : BacklogTask.defaultReportStrategies.count,
    componentName   : BacklogTask.defaultReportStrategies.count,
    versionName     : BacklogTask.defaultReportStrategies.count
};


//==================================================
//#  Backlog HTML Utilities

var BacklogHTML = {};

BacklogHTML.getCSVURL = function getCSVURL() {
    var url = location.href.match(/^https:\/\/[^/]+/)+"/csvExportIssue/Backlog-Issues-autofilter.csv";
    var form = $ID("exportForm");
    var elements = form.elements;
    var queryComponents = [];
    for(var i=0, j=elements.length; i<j; i++) {
        queryComponents.push(serialize(elements[i]));
    }
    return url+"?"+queryComponents.join("&");
    
    function serialize(element) {
        if (element.type == "select") {
            return serializeSelect(element);
        } else {
            var key = element.name;
            var value = element.value;
            return encodeURIComponent(key)+"="+encodeURIComponent(value);
        }
    }
    function serializeSelect(select) {
        var value = [];
        var key = encodeURIComponent(select.name);
        for (var i = 0; i < element.length; i++) {
            var opt = element.options[i];
            if (opt.selected) {
                var t = opt.value || opt.text;
                value.push(key+"="+encodeURIComponent(t));
            }
        }
        return value.join("&");
    }
}

BacklogHTML.getAPIURL = function getAPIURL() {
    var href = $ID('navi-home').href;
    var m = href.match(/^(.*)\/projects/);
    if (m) return m[1]+"/XML-RPC";
    return null;
}

BacklogHTML.getProjectID = function getProjectID() {
    var m = BacklogHTML.getCSVURL().match(/^.*projectId=([0-9]+)/);
    if (m) return parseInt(m[1],10);
    return null;
}

BacklogHTML.getProjectKey = function getProjectKey() {
    var href = $ID('navi-home').href;
    var m = href.match(/^.*projects\/([^?]*)/);
    if (m) return m[1];
    return null;
}


//==================================================
//# Backlog API via XHR
//     

function XML(str) {
	var parsed = new DOMParser().parseFromString(str, "text/xml" );
	return parsed && parsed.firstChild;
}

function TAG(tag,content) { // E4X like helper
	if (content instanceof Array) {
		content = content.join("");
	}
	return "<"+tag+">"+content+"</"+tag+">";
}

function XMLRPC() {} // もうちょっとXMLRPCらしくしたい
XMLRPC.prototype = {
    proxy: function(endPoint) {
        this.endPoint = endPoint;
        return this;
    },
    call: function(method, paramXML) {
        this.param = TAG("methodCall",
						 [TAG("methodName",method),
						  TAG("params",paramXML)]);
        return this;
    },
    result: function(callback) {
        var self = this;
        xmlhttpRequest({
            method: 'post',
            url: this.endPoint,
            data: this.param,
            onload: function(res) {
                //console.log("XHR OK : %o -> %o",self.param, res);
                var response = res.responseXML;
                callback(response);
            },
            onerror: function(res) {
                //console.log("XHR error : %o",res);
            }});
        return this;
    }
};

var BacklogAPI = {
    url: (function () {
        var href = $ID('navi-home').href;
        var m = href.match(/^(.*)\/projects/);
        if (m) return m[1]+"/XML-RPC";
        return null;
    })(),
    STATUS: { // タスクの状態
        WAITING   : 1,
        WORKING   : 2,
        DONE      : 3,
        COMPLETED : 4 //完了からは処理中にしか戻せない？
    },
    STATUSES:[
        {id:1, name:"未対応"},
        {id:2, name:"処理中"},
        {id:3, name:"処理済み"},
        {id:4, name:"完了"}
    ],
    RESOLUTION: { // タスクを完了させた理由
        DONE           : 0,
        REMAIN         : 1,
        INVALID        : 2,
        DUPLICATED     : 3,
        NOT_RECURRENCE : 4
    },
    RESOLUTIONS: [
        {id: 0, name:"対応した"},
        {id: 1, name:"対応しない"},
        {id: 2, name:"無効"},
        {id: 3, name:"重複"},
        {id: 4, name:"再現せず"}
    ],
    PRIORITY: { // タスクの優先度
        HIGH   : 2,
        MIDDLE : 3,
        LOW : 4
    },
    PRIORITIES: [
        {id: 2, name: "高"},
        {id: 3, name: "中"},
        {id: 4, name: "低"}
    ],
    CUSTOM_FIELD_TYPES: {
        TEXT:            1,
        AREA:            2,
        NUMBER:          3,
        DATE:            4,
        SELECT:          5,
        MULTI_SELECT:    6,
        CHECKBOX:        7,
        RADIOBOX:        8
    },
    CUSTOM_FIELD_TYPES_REPORT: { // カスタムフィールドの統計タイプ
        "3": BacklogTask.defaultReportStrategies.sumFloat,
        "5": BacklogTask.defaultReportStrategies.count,
        "6": BacklogTask.defaultReportStrategies.count,
        "7": BacklogTask.defaultReportStrategies.count,
        "8": BacklogTask.defaultReportStrategies.count,
    },
    _execAPI: function(method,paramXML,responseHandler) {
        new XMLRPC().proxy(this.url).call(method,paramXML)
            .result(responseHandler);
    },
	_selectNode: function(name,node) {
		if (node.hasChildNodes()) {
			var elms = node.childNodes;
			for (var i=0, j=elms.length; i<j; i++) {
				if (elms[i].nodeName == name) return elms[i];
			}
		}
		return null;
	},
	_firstNode: function(node) {
		if (node.hasChildNodes()) {
			var elms = node.childNodes;
			if (elms.length == 1) return elms[0];
			for (var i=0, j=elms.length; i<j; i++) {
				if (elms[i].nodeType == 1) return elms[i];
			}
		}
		return null;
	},
	_parseValue: function(v) {
	    if (!v || !v.hasChildNodes() || !v.nodeName) {
	        return (!!v) ? v.textContent : "";
	    }
	    switch (v.nodeName) {
	    case "i4":
	    case "int":
	        return parseInt(v.textContent,10);
	    case "string":
	        return v.textContent;
	    case "boolean":
	        return v.textContent == "true";
	    case "struct":
	        return BacklogAPI._struct2obj(v);
	    case "array":
	        var array = [];
			var elms = BacklogAPI._firstNode(v).childNodes;
	        for (var i=0,j=elms.length; i<j; i++) {
				var m = elms[i];
				if (m.nodeType != 1) continue;
	            array.push(BacklogAPI._parseValue(BacklogAPI._firstNode(m)));
	        }
	        return array;
	        break;
	    default:
	        return v;//abandon
	    }
	},

    //<struct>をもらって、JSのオブジェクトに変換する
    _struct2obj: function(xml) {
        var ret = {};
		var elms = xml.childNodes;
        for (var i = 0; i<elms.length; i++) {
			var member = elms[i];
			if (member.nodeType != 1) continue;
            var keyElm = BacklogAPI._selectNode("name",member);
			var valElm = BacklogAPI._selectNode("value",member);
			if (keyElm) {
				ret[keyElm.textContent] = 
					BacklogAPI._parseValue(BacklogAPI._firstNode(valElm));
			}
        }
        return ret;
    },

    //JSのオブジェクトを<struct>に変換する
    _obj2struct: function(obj) {
        var ret = [];
        for(var key in obj) {
            var val = obj[key];
			var valTag = null;
            if (typeof(val) == "number") {
                valTag = TAG("int",val);
            } else if (typeof(val) == "string" || val instanceof String) {
                valTag = TAG("string",val);
            } else if (val && typeof(val) == "object") {
				valTag = arguments.callee(val);
            } else if (val === null) {
				valTag = "<nil/>";
			} else {
				valTag = "";
			}
			ret.push(TAG("member", [TAG("name",key), TAG("value",valTag)]));
        }
        return TAG("struct",ret);
    },

    _getObjects: function _getObjects(method,param,callback) {
        var self = this;
        this._execAPI(method,param,
					  function(response){
						  //console.log(response);
						  var list = [];
						  var elms = $X("/methodResponse/params/param/value/array/data/value/struct",response);
						  for (var i=0; i<elms.length; i++) {
							  list.push( self._struct2obj(elms[i]) );
						  }
						  callback(list);
					  });
    },

    /**
     * プロジェクトに参加しているユーザーの一覧をとって来る
     * 
     * >> 帰り値
     * [ {id: (id), name: (name) }, ....  ]
     */
    retrieveUsers: function retrieveUsers(callback) {
        var param = TAG("param",TAG("value",TAG("int",BacklogHTML.getProjectID())));
        this._getObjects("backlog.getUsers",param,callback);
    },
    /**
     * 種別一覧をとって来る
     * 
     * >> 帰り値
     * [ { id:, name:, color: "#xxyyzz" }, ... ]
     */
    retrieveIssueTypes: function retrieveIssueTypes(callback) {
        var param = TAG("param",TAG("value",TAG("int",BacklogHTML.getProjectID())));
        this._getObjects("backlog.getIssueTypes",param,callback);
    },
    /**
     * カテゴリ一覧をとって来る
     * 
     * >> 帰り値
     * [ { id:, name: }, ... ]
     */
    retrieveComponents: function retrieveComponents(callback) {
        var param = TAG("param",TAG("value",TAG("int",BacklogHTML.getProjectID())));
        this._getObjects("backlog.getComponents",param,callback);
    },
    /**
     * バージョン一覧をとって来る
     * 
     * >> 帰り値
     * [ {id:, name:, date:"YYYYMMDD" }, ... ]
     */
    retrieveVersions: function retrieveVersions(callback) {
        var param = TAG("param",TAG("value",TAG("int",BacklogHTML.getProjectID())));
        this._getObjects("backlog.getVersions",param,callback);
    },
    /**
     * 指定したタスクのコメントの一覧をとって来る
     * 
     * >> 帰り値
     * [ {id:, content:, created_on:, updated_on:, created_user:{name:,id:} }, ... ]
     */
    retrieveComments: function retrieveComments(taskId,callback) {
        var param = TAG("param",TAG("value",TAG("int",taskId)));
        this._getObjects("backlog.getComments",param,callback);
    },
    /**
     * カスタムフィールド一覧を取ってくる
     * 
     * >> 帰り値
     * [ {id:, content:, created_on:, updated_on:, created_user:{name:,id:} }, ... ]
     */
    retrieveCustomFields: function retrieveCustomFields(callback) {
        var param = TAG("param",TAG("value",TAG("int",BacklogHTML.getProjectID())));
        this._getObjects("backlog.getCustomFields",param,callback);
    },
    /**
     * 必須(key,statusId)と変えたいものだけ入れる
     * 
     * >> change :
     * key*      : EXT-1
     * statusId*    : 状態ID
     * assignerId   : 担当者ID
     * resolutionId : 完了理由ID
     * comment    : コメント
     * 
     * >> 帰り値はタスクオブジェクト
     */
    changeTaskStatus: function changeTaskStatus(change,callback) {
        var self = this;
        var param = TAG("param",TAG("value", this._obj2struct( change )));
        this._execAPI(
            "backlog.switchStatus",param,
            function(response){
				var elms = $X("/methodResponse/params/param/value/struct",response);
				if (elms == null || elms.length == 0) {
					elms = $X("/methodResponse/fault/value/struct",response);
				}
				callback( self._struct2obj(elms[0]) );
            });
    },
    /**
     * 必須(key)と変えたいものだけ入れる。
     * 
     * >> task :
     * key*      : EXT-1
     * summary    : 件名
     * description  : 詳細
     * due_date  : "YYYYMMDD"
     * issueTypeId  : 分類  1:bug, 2:task, 3:wish, 4:etc
     * componentId  : カテゴリID
     * versionId    : マイルストーンID
     * milestoneId  : マイルストーンID
     * priorityId   : 優先度ID
     * assignerId   : 担当者ユーザーID
     * resolutionId : 完了理由ID
     * comment    : コメント
     * 
     * >> 帰り値はタスクオブジェクト
     */
    changeTaskData: function changeTaskData(task,callback) {
        var self = this;
        var param = TAG("param",TAG("value", this._obj2struct( task )));
        this._execAPI(
            "backlog.updateIssue",param,
            function(response){
				var elms = $X("/methodResponse/params/param/value/struct",response);
				if (elms == null || elms.length == 0) {
					elms = $X("/methodResponse/fault/value/struct",response);
				}
                callback( self._struct2obj(elms[0]) );
            });
    }
};

//debug
/*
BacklogAPI.retrieveUsers(function(list){console.log("users: %o",list);});
BacklogAPI.retrieveComments(204864,function(list){console.log("comments: %o",list);});
BacklogAPI.retrieveComponents(function(list){console.log("components: %o",list);});
BacklogAPI.retrieveVersions(function(list){console.log("versions: %o",list);});
BacklogAPI.retrieveIssueTypes(function(list){console.log("issue types: %o",list);});
BacklogAPI.changeTaskStatus(
    {
        key: "EXT-1",
        statusId: BacklogAPI.STATUS.WAITING,
        comment: "RPC TEST 御迷惑をお掛けします。"
    },function(res) {
        console.log(res);
    });
BacklogAPI.changeTaskData(
    {
        key: "EXTEST-1",
        issueTypeId: 3,
        comment: "RPC TEST 御迷惑をお掛けします。"
    },function(res) {
        console.log(res);
    });
*/


//==================================================
//# CSV Parser

var CSV = {
    quoteState: function quoteState(line,cols) {
        var pss = line.indexOf('"');
        var cur = pss+1,psqe;
        while(true) {
            psqe = line.indexOf('"',cur);
            if (psqe == -1) throw "wrong format: can not find quote end... ["+line+"]";
            if (line[psqe+1] == '"') {
                //quote in quote
                cur = psqe+2;
            } else {
                //quote end
                var content = line.substring(pss+1,psqe);
                content = content.replace("\\n","\n").replace('""','"');
                cols.push(content);
                break;
            }
        }
        var ps = line.indexOf(",",psqe+1);
        if (ps == -1) return "";//last column
        return line.substring(ps+1);
    },

    columnState: function columnState(line,cols) {
        var ps = line.indexOf(",");
        if (ps == -1) {
            cols.push(line);
            return "";
        }
        cols.push(line.substring(0,ps));
        return line.substring(ps+1);
    },

    next: function next(line) {
        if (!line || !line.length) return null;
        //find column head
        var psq = line.indexOf("\"");
        var psc = line.indexOf(",");
        if (psc < 0) {
            if (psq < 0) {
                //last normal
                return CSV.columnState;
            } else {
                //last quoted
                return CSV.quoteState;
            }
        }
        if (psq >= 0 && psc >= 0) {
            if (psc < psq) {
                //normal
                return CSV.columnState;
            } else {
                //quoted
                return CSV.quoteState;
            }
        } else if (psq >= 0) {
            //quoted
            return CSV.quoteState;
        } else {
            //normal
            return CSV.columnState;
        }
    },

    split: function split(line) {
        var cols = [];
        var state = CSV.next(line);
        while(state) {
            line = state(line,cols);
            state = CSV.next(line);
        }
        return cols;
    }
};

function formatDate(str) {
    var ret = null;
    if (str && str.length >= 8) {
        ret = str.substring(0,4)+"/"+str.substring(4,6)+"/"+str.substring(6,8);
    } else {
        return str;
    }
    if (str.length >= 14) {
        ret += " "+str.substring(8,10)+":"+str.substring(10,12)+":"+str.substring(12,14);
    }
    return ret;
}

// export

// unsafeWindow.BacklogAPI = BacklogAPI;
