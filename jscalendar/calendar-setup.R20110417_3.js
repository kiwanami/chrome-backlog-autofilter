Calendar.setup=function(G){function F(H,I){if(typeof G[H]=="undefined"){G[H]=I
}}F("inputField",null);
F("displayArea",null);
F("button",null);
F("eventName","click");
F("ifFormat","%Y/%m/%d");
F("daFormat","%Y/%m/%d");
F("singleClick",true);
F("disableFunc",null);
F("dateStatusFunc",G.disableFunc);
F("dateText",null);
F("firstDay",null);
F("align","Br");
F("range",[1900,2999]);
F("weekNumbers",true);
F("flat",null);
F("flatCallback",null);
F("onSelect",null);
F("onClose",null);
F("onUpdate",null);
F("date",null);
F("showsTime",false);
F("timeFormat","24");
F("electric",true);
F("step",2);
F("position",null);
F("cache",false);
F("showOthers",false);
F("multiple",null);
var C=["inputField","displayArea","button"];
for(var B in C){if(typeof G[C[B]]=="string"){G[C[B]]=document.getElementById(G[C[B]])
}}if(!(G.flat||G.multiple||G.inputField||G.displayArea||G.button)){alert("Calendar.setup:\n  Nothing to setup (no fields found).  Please check your code");
return false
}function A(I){var H=I.params;
var J=(I.dateClicked||H.electric);
if(J&&H.inputField){H.inputField.value=I.date.print(H.ifFormat);
if(typeof H.inputField.onchange=="function"){H.inputField.onchange()
}}if(J&&H.displayArea){H.displayArea.innerHTML=I.date.print(H.daFormat)
}if(J&&typeof H.onUpdate=="function"){H.onUpdate(I)
}if(J&&H.flat){if(typeof H.flatCallback=="function"){H.flatCallback(I)
}}if(J&&H.singleClick&&I.dateClicked){I.callCloseHandler()
}}if(G.flat!=null){if(typeof G.flat=="string"){G.flat=document.getElementById(G.flat)
}if(!G.flat){alert("Calendar.setup:\n  Flat specified but can't find parent.");
return false
}var E=new Calendar(G.firstDay,G.date,G.onSelect||A);
E.showsOtherMonths=G.showOthers;
E.showsTime=G.showsTime;
E.time24=(G.timeFormat=="24");
E.params=G;
E.weekNumbers=G.weekNumbers;
E.setRange(G.range[0],G.range[1]);
E.setDateStatusHandler(G.dateStatusFunc);
E.getDateText=G.dateText;
if(G.ifFormat){E.setDateFormat(G.ifFormat)
}if(G.inputField&&typeof G.inputField.value=="string"){E.parseDate(G.inputField.value)
}E.create(G.flat);
E.show();
return false
}var D=G.button||G.displayArea||G.inputField;
D["on"+G.eventName]=function(){var H=G.inputField||G.displayArea;
var J=G.inputField?G.ifFormat:G.daFormat;
var N=false;
var L=window.calendar;
if(H){G.date=Date.parseDate(H.value||H.innerHTML,J)
}if(!(L&&G.cache)){window.calendar=L=new Calendar(G.firstDay,G.date,G.onSelect||A,G.onClose||function(O){O.hide()
});
L.showsTime=G.showsTime;
L.time24=(G.timeFormat=="24");
L.weekNumbers=G.weekNumbers;
N=true
}else{if(G.date){L.setDate(G.date)
}L.hide()
}if(G.multiple){L.multiple={};
for(var I=G.multiple.length;
--I>=0;
){var M=G.multiple[I];
var K=M.print("%Y%m%d");
L.multiple[K]=M
}}L.showsOtherMonths=G.showOthers;
L.yearStep=G.step;
L.setRange(G.range[0],G.range[1]);
L.params=G;
L.setDateStatusHandler(G.dateStatusFunc);
L.getDateText=G.dateText;
L.setDateFormat(J);
if(N){L.create()
}L.refresh();
if(!G.position){L.showAtElement(G.button||G.displayArea||G.inputField,G.align)
}else{L.showAt(G.position[0],G.position[1])
}return false
};
return E
};