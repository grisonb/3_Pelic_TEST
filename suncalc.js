/*
 (c) 2011-2015, Vladimir Agafonkin
 SunCalc is a JavaScript library for calculating sun position, sunlight phases (times for sunrise, sunset, dusk, etc.),
 moon position and lunar phase for the given location and time.
 https://github.com/mourner/suncalc
*/

(function () { 'use strict';
var PI=Math.PI,sin=Math.sin,cos=Math.cos,tan=Math.tan,asin=Math.asin,atan=Math.atan2,acos=Math.acos,rad=PI/180;
var dayMs=864e5,J1970=2440588,J2000=2451545;
function toJulian(a){return a.valueOf()/dayMs-.5+J1970}function fromJulian(a){return new Date((a+.5-J1970)*dayMs)}function toDays(a){return toJulian(a)-J2000}
var e=rad*23.4397;
function rightAscension(a,b){return atan(sin(a)*cos(e)-tan(b)*sin(e),cos(a))}function declination(a,b){return asin(sin(b)*cos(e)+cos(b)*sin(e)*sin(a))}
function azimuth(a,b,c){return atan(sin(a),cos(a)*sin(b)-tan(c)*cos(b))}function altitude(a,b,c){return asin(sin(b)*sin(c)+cos(b)*cos(c)*cos(a))}
function siderealTime(a,b){return rad*(280.4606+360.98564736629*a)-b}
function astroRefraction(a){return a<0&&(a=0),.0002967/Math.tan(a+.00312536/(a+.08901179))}
function solarMeanAnomaly(a){return rad*(357.5291+.98560028*a)}
function eclipticLongitude(a){var b=rad*(1.9148*sin(a)+.02*sin(2*a)+.0003*sin(3*a)),c=rad*102.9372;return a+b+c+PI}
function sunCoords(a){var b=solarMeanAnomaly(a),c=eclipticLongitude(b);return{dec:declination(c,0),ra:rightAscension(c,0)}}
var SunCalc={};
SunCalc.getPosition=function(a,b,c){var d=rad*-c,f=rad*b,g=toDays(a),h=sunCoords(g),i=siderealTime(g,d)-h.ra;return{azimuth:azimuth(i,f,h.dec),altitude:altitude(i,f,h.dec)}};
var times=SunCalc.times=[[-.833,"sunrise","sunset"],[-.3,"sunriseEnd","sunsetStart"],[-6,"dawn","dusk"],[-12,"nauticalDawn","nauticalDusk"],[-18,"nightEnd","night"],[6,"goldenHourEnd","goldenHour"]];
SunCalc.addTime=function(a,b,c){times.push([a,b,c])};
var J0=.0009;
function julianCycle(a,b){return Math.round(a-J0-b/(2*PI))}
function approxTransit(a,b,c){return J0+(a+b)/(2*PI)+c}function solarTransitJ(a,b,c){return J2000+a+.0053*sin(b)-.0069*sin(2*c)}
function hourAngle(a,b,c){return acos((sin(a)-sin(b)*sin(c))/(cos(b)*cos(c)))}function observerAngle(a){return-2.076*Math.sqrt(a)/60}
function getSetJ(a,b,c,d,e,f,g){var h=hourAngle(a,c,d),i=approxTransit(h,b,e);return solarTransitJ(i,f,g)}
SunCalc.getTimes=function(a,b,c,d){d=d||0;var e=rad*-c,f=rad*b,g=toDays(a),h=julianCycle(g,e),i=approxTransit(0,e,h),j=solarMeanAnomaly(i),k=eclipticLongitude(j),l=declination(k,0),m=solarTransitJ(i,j,k),n={solarNoon:fromJulian(m),nadir:fromJulian(m-.5)};for(var o=0,p=times.length;o<p;o+=1){var q=times[o],r=(q[0]+observerAngle(d))*rad,s=getSetJ(r,e,f,l,h,j,k),u=m-(s-m);n[q[1]]=fromJulian(u),n[q[2]]=fromJulian(s)}return n};
function moonCoords(a){var b=rad*(218.316+13.176396*a),c=rad*(134.963+13.064993*a),d=rad*(93.272+13.22935*a),e=b+rad*6.289*sin(c),f=rad*5.128*sin(d),g=385001-20905*cos(c);return{ra:rightAscension(e,f),dec:declination(e,f),dist:g}}
SunCalc.getMoonPosition=function(a,b,c){var d=rad*-c,e=rad*b,f=toDays(a),g=moonCoords(f),h=siderealTime(f,d)-g.ra,i=altitude(h,e,g.dec),j=atan(sin(h),tan(e)*cos(g.dec)-sin(g.dec)*cos(h));return i+=astroRefraction(i),{azimuth:azimuth(h,e,g.dec),altitude:i,distance:g.dist,parallacticAngle:j}};
SunCalc.getMoonIllumination=function(a){var b=toDays(a||new Date),c=sunCoords(b),d=moonCoords(b),e=149598000,f=acos(sin(c.dec)*sin(d.dec)+cos(c.dec)*cos(d.dec)*cos(c.ra-d.ra)),g=atan(e*sin(f),d.dist-e*cos(f)),h=atan(cos(c.dec)*sin(c.ra-d.ra),sin(c.dec)*cos(d.dec)-cos(c.dec)*sin(d.dec)*cos(c.ra-d.ra));return{fraction:(1+cos(g))/2,phase:.5+.5*g*(h<0?-1:1)/PI,angle:h}};
function hoursLater(a,b){return new Date(a.valueOf()+b*dayMs/24)}
SunCalc.getMoonTimes=function(a,b,c,d){var e=new Date(a);d?e.setUTCHours(0,0,0,0):e.setHours(0,0,0,0);var f=.133*rad,g=SunCalc.getMoonPosition(e,b,c).altitude-f,h,i,j,k,l,m,n,o,p,q,r,s;for(var u=1;u<=24;u+=2){h=SunCalc.getMoonPosition(hoursLater(e,u),b,c).altitude-f,i=SunCalc.getMoonPosition(hoursLater(e,u+1),b,c).altitude-f,l=(g+i)/2-h,m=(i-g)/2,n=-m/(2*l),o=(l*n+m)*n+h,p=m*m-4*l*h,q=0,p>=0&&(r=Math.sqrt(p)/(Math.abs(l)*2),s=n-r,t=n+r,Math.abs(s)<=1&&q++,Math.abs(t)<=1&&q++,s<-1&&(s=t)),1===q?g<0?j=u+s:k=u+s:2===q&&(j=u+(o<0?t:s),k=u+(o<0?s:t)),j&&k&&g>h||(g=i)}var v={};return j&&(v.rise=hoursLater(e,j)),k&&(v.set=hoursLater(e,k)),j||k||(v[o>0?"alwaysUp":"alwaysDown"]=!0),v};
"object"==typeof exports&&"undefined"!=typeof module?module.exports=SunCalc:"function"==typeof define&&define.amd?define(SunCalc):window.SunCalc=SunCalc;
}());
