///////////////////////////////////////////////////////////////////////////
// Copyright © 2014 Esri. All Rights Reserved.
//
// Licensed under the Apache License Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
///////////////////////////////////////////////////////////////////////////

define([
    'dojo/_base/declare',
    'dijit/_WidgetsInTemplateMixin',
    'jimu/BaseWidget',
    'dojo/_base/lang',
    'dojo/on',
    'dojo/Deferred',
    'dojo/_base/html',
    'dojo/_base/Color',
    'dojo/_base/array',
    'jimu/dijit/ViewStack',
    'jimu/utils',
    'jimu/SpatialReference/wkidUtils',

    "dijit/layout/TabContainer",
    "dijit/layout/ContentPane",

    'esri/tasks/query',
    'esri/tasks/QueryTask',
    'esri/layers/GraphicsLayer',
    'esri/renderers/SimpleRenderer',
    'esri/InfoTemplate',
    'esri/symbols/jsonUtils',
    "esri/tasks/DistanceParameters",
    "esri/tasks/ProjectParameters",
    "esri/SpatialReference",
    'esri/config',
    'esri/graphic',
    'esri/geometry/Polyline',
    'esri/geometry/Polygon',
    'esri/geometry/Circle',
    'esri/symbols/TextSymbol',
    'esri/symbols/Font',
    "esri/request",
    'esri/units',
    'esri/geometry/webMercatorUtils',
    'esri/geometry/geodesicUtils',
    'esri/tasks/GeometryService',
    'esri/tasks/AreasAndLengthsParameters',
    'esri/tasks/LengthsParameters',

    'widgets/FullStackTest/DrawBoxRec',
    'widgets/FullStackTest/js/bootstrap-table'
  ],
    function (declare, _WidgetsInTemplateMixin, BaseWidget, lang, on, Deferred, html, Color, array, ViewStack,
        jimuUtils, wkidUtils, TabContainer, ContentPane,
        EsriQuery, QueryTask, GraphicsLayer, SimpleRenderer, InfoTemplate, symbolJsonUtils,
        DistanceParameters, ProjectParameters,
        SpatialReference, esriConfig, Graphic, Polyline, Polygon, Circle,
        TextSymbol, Font, esriRequest, esriUnits, webMercatorUtils, geodesicUtils, GeometryService,
        AreasAndLengthsParameters, LengthsParameters) {
        return declare([BaseWidget, _WidgetsInTemplateMixin], {
            name: 'FullStackTest',
            baseClass: 'jimu-widget-map',

            //Define two layers to add point graphics on the map
            selectedPointLayer: new esri.layers.GraphicsLayer({
                opacity: 0.80
            }),

            selectedHighlightedLayer: new esri.layers.GraphicsLayer({
                opacity: 1
            }),

            postMixInProperties: function () {
                this.inherited(arguments);
            },
            geometryService: new GeometryService("https://utility.arcgisonline.com/ArcGIS/rest/services/Geometry/GeometryServer"),

            /*****************************************************************************************
             *
             *	Define the panel init and close functions.
             *
             ****************************************************************************************/
            postCreate: function () {
                this.inherited(arguments);

                //Add select record layer and highlight record layer into the map
                this.map.addLayer(this.selectedPointLayer);
                this.map.addLayer(this.selectedHighlightedLayer);

                //Init the select from map draw box
                this.drawBox.setMap(this.map);

                //Init the select record table
                this.selectedTableID = "tb_selectedRecord";
                var innerTHHTMLStr = "";
                var fieldList = [{
                    "Field": "PropertyId",
                    "Label": "Property ID: ",
                    "sortable": "true"
                    }, {
                    "Field": "Latitude",
                    "Label": "Latitude: ",
                    "sortable": "true"
                    }, {
                    "Field": "Longitude",
                    "Label": "Longitude: ",
                    "sortable": "true"
                    }];
                //generate the innerhtml for the table
                for (var k = 0; k < fieldList.length; k++) {
                    var tempObj = fieldList[k];
                    innerTHHTMLStr = innerTHHTMLStr + '<th data-field="' + tempObj.Field + '" data-align="center" >' + tempObj.Label + '</th> ';
                }
                this.innerHTML = '<thead><tr>' + innerTHHTMLStr + ' </tr></thead>';

                //create table to div
                html.create("table", {
                    innerHTML: this.innerHTML,
                    id: this.selectedTableID,
                    class: "table table-hover table-striped " + this.selectedTableID,
                    "data-dojo-attach-point": this.selectedTableID,
                    "data-pagination": "true",
                    "data-page-list": "[3]",
                    "data-page-Size": "3",
                    "data-card-view": "true"

                }, this.selectedRecordDiv);

                //bind hover and click functions to the table
                this.own(on(this.getWidget(this.selectedTableID), 'mouseover', lang.hitch(this, this._onResultsHover)));
                this.own(on(this.getWidget(this.selectedTableID), 'click', lang.hitch(this, this._onResultsClicked)));

                //bind DrawBox click and draw functions
                this.own(on(this.drawBox, 'IconSelected', lang.hitch(this, this._onIconSelected)));
                this.own(on(this.drawBox, 'DrawEnd', lang.hitch(this, this._onDrawEnd)));

                //Read API and proxy links from the configuration file
                this.setWidgetConfig(this.config);

            },
            startup: function () {
                this.inherited(arguments);

                //Can add user saved info function here, no time to implement

            },

            destroy: function () {

                if (this.drawBox) {
                    this.drawBox.destroy();
                    this.drawBox = null;
                }

                this.clearAllParams(true, true);
                this.inherited(arguments);
            },

            onClose: function () {

                this.clearAllParams(true);
            },


            /*****************************************************************************************
             *
             *	Define the Constructions for configured API links and proxy link.
             *
             ****************************************************************************************/

            config: null,
            APIHost: null,
            crosProxy: null,
            selectedTableID: "",
            setWidgetConfig: function (config) {

                this.config = config;

                //load API url and construct the full address
                if (this.isNotNull(this.config)) {
                    this.APIHost = config.APIHost;
                    this.crosProxy = config.crosProxy;
                }

                //Init load sample records to the map, can take it off if here is no need to load.
                this.findAllRecord(26.8849731, -80.0782213, 1755000, false);
            },

            getImageURL: function (id, overlay, parcel, building) {
                return this.APIHost + '/display/' + id + '?overlay=' + overlay + '&parcel=' + parcel + '&building=' + building;
            },

            getStatisticsURL: function (id, distance) {
                return this.APIHost + '/statistics/' + id + '?distance=' + distance;
            },

            findRecordURL: function () {
                return this.APIHost + '/find';
            },

            /*****************************************************************************************
             *
             *	Define the API Get and Post function.
             *
             ****************************************************************************************/

            selectRecordList: [],
            selectTableAttrList: [],

            //Define the process to call Display Image API
            displayImage: function (propertyID) {

                var theUrl = this.getImageURL(propertyID, "yes", "green", "orange");
                this.requester = this.getRequester();
                this.requester.open("GET", this.crosProxy + theUrl, true);
                this.requester.setRequestHeader("Content-Type", "text/plain");

                // Ask for the result as an ArrayBuffer.
                this.requester.responseType = "arraybuffer";
                this.requester.onload = function (e) {
                    // Obtain a blob: URL for the image data.
                    var arrayBufferView = new Uint8Array(this.response);
                    var blob = new Blob([arrayBufferView], {
                        type: "image/jpeg"
                    });
                    var urlCreator = window.URL || window.webkitURL;
                    var imageUrl = urlCreator.createObjectURL(blob);
                    var img = document.querySelector("#imgPropertyDisplay");
                    img.src = imageUrl;
                };

                this.requester.send();
            },

            //Define the process to call Find API
            findAllRecord: function (lat, long, radius, highlight) {

                var theUrl = this.findRecordURL();
                this.requester = this.getRequester();
                this.requester.open("POST", this.crosProxy + theUrl, false);
                this.requester.setRequestHeader("Content-Type", "text/plain");

                var queryDataParam = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [parseFloat(long), parseFloat(lat)]
                    },
                    "x-distance": parseInt(radius)
                };
                this.requester.send(JSON.stringify(queryDataParam));
                var returns = this.requester.responseText;

                if (this.isNotNull(returns)) {
                    var returnedMsgArray = JSON.parse(returns);
                    if (this.isNotNull(returnedMsgArray)) {

                        //Function to process the returned list
                        this.loadDataToMap(returnedMsgArray, highlight);
                    }
                }

            },


            //Define the process when you have the record returned from Find API
            //1. We first create a point which can be displayed on the map
            //2. We add the points to the map, and also to a selected List
            //3. We render the selected table with the list from Step2
            loadDataToMap: function (records, highlight) {
                //render records on the map
                this.selectRecordList = [];
                this.selectTableAttrList = [];
                for (var i = 0; i < records.length; i++) {
                    var coords = records[i];
                    if (this.isNotNull(coords)) {
                        if (this.isNotNull(coords.coordinates) && coords.coordinates.length == 2) {

                            //1. We first create a point which can be displayed on the map
                            var point = this.createESRIPoint(coords, highlight);

                            //2. We add the points to the map, and also to a selected List
                            this._updateSelectedGeometry(point, highlight);

                            var highlightedPoint = this.createESRIPoint(coords, true);
                            this.selectRecordList.push(highlightedPoint);

                            var long = coords.coordinates[0];
                            var lat = coords.coordinates[1];
                            var propertyId = coords.propertyId;
                            var attrItem = {
                                "Longitude": long,
                                "Latitude": lat,
                                "PropertyId": propertyId
                            };

                            this.selectTableAttrList.push(attrItem);
                        }

                    }
                }

                //3. We render the selected table with the list from Step2
                $('#' + this.selectedTableID).bootstrapTable({
                    url: 'x',
                    columns: [],
                    data: this.selectTableAttrList
                });
                $('#' + this.selectedTableID).bootstrapTable('load', this.selectTableAttrList);
                $('#' + this.selectedTableID).bootstrapTable('refresh');
            },

            //Define a new point with symbols, attributes, infotemplates, and geometry//
            //Symbols for rendering 
            //attributes for Property ID and lat & long
            //Infotemplate for the click on the feature function to show a popup with html wrapper
            //geometry for highlights when click or hover over the selected record table
            createESRIPoint: function (coords, highlight) {
                var long = coords.coordinates[0];
                var lat = coords.coordinates[1];
                var propertyId = coords.propertyId;
                var symbols = {};
                if (highlight) {
                    symbols = {
                        "color": [255, 255, 102],
                        "size": 20,
                        "angle": 0,
                        "xoffset": 0,
                        "yoffset": 0,
                        "type": "esriSMS",
                        "style": "esriSMSCircle",
                        "outline": {
                            "color": [51, 204, 204],
                            "width": 3,
                            "type": "esriSLS",
                            "style": "esriSLSSolid"
                        }
                    };
                } else {
                    symbols = {
                        "color": [22, 248, 5],
                        "size": 15,
                        "angle": 0,
                        "xoffset": 0,
                        "yoffset": 0,
                        "type": "esriSMS",
                        "style": "esriSMSCircle",
                        "outline": {
                            "color": [17, 122, 139],
                            "width": 2,
                            "type": "esriSLS",
                            "style": "esriSLSSolid"
                        }
                    };
                }

                var myPoint = {
                    "geometry": {
                        "x": long,
                        "y": lat,
                        "spatialReference": {
                            "wkid": 4326
                        }
                    },
                    "attributes": {
                        "XCoord": long,
                        "YCoord": lat,
                        "propertyId": propertyId
                    },

                    "symbol": symbols,

                    "infoTemplate": {
                        "title": "Real Estate Property",
                        "content": "<strong>PropertyId:</strong> ${propertyId} </br></br> <strong>Latitude:</strong> ${YCoord} <br/></br> <strong>Longitude:</strong> ${XCoord}"
                    }
                };
                return myPoint;
            },

            //Add a highlight graphic on the map when get a new point.////////////////////////////////////
            _updateSelectedGeometry: function (myPoint, highlighed) {
                if (highlighed) {
                    this.selectedHighlightedLayer.clear();
                    var graphicPoint = new esri.Graphic(myPoint);
                    this.selectedHighlightedLayer.add(graphicPoint);
                } else {

                    var graphicPoint = new esri.Graphic(myPoint);
                    this.selectedPointLayer.add(graphicPoint);
                }

            },

            /*****************************************************************************************
             *
             *	Define the get Statistics function.
             *
             ****************************************************************************************/

            //Define the get Statistics event after you clicked the selected record table
            //1. It use XMLHttpRequest to load from get statistics API
            //2. It might return just one object, or return an Arry, so also convert object to the Array which will be used next
            //3. Loop the array to generate the table HTML for all values inside the Statistics object
            getStatistics: function (propertyID, distance) {

                var theUrl = this.getStatisticsURL(propertyID, distance);
                this.requester = this.getRequester();
                this.requester.open("GET", this.crosProxy + theUrl, false);
                this.requester.setRequestHeader("Content-Type", "text/plain");
                this.requester.send();
                var returns = this.requester.responseText;
                if (this.isNotNull(returns)) {
                    var returnedMsgArray = JSON.parse(returns);
                    if (this.isNotNull(returnedMsgArray)) {

                        var detailsInfoStr = "";

                        //2. It might return just one object, or return an Arry, so also convert object to the Array which will be used next
                        if (returnedMsgArray.length == undefined || returnedMsgArray.length == null) {
                            var tempArray = [];
                            tempArray.push(returnedMsgArray);
                            returnedMsgArray = tempArray;
                        }
                        for (var i = 0; i < returnedMsgArray.length; i++) {
                            var returnStatObj = returnedMsgArray[i];
                            if (this.isNotNull(returnStatObj)) {
                                for (keyIndex in Object.keys(returnStatObj)) {
                                    var valueTemp = returnStatObj[Object.keys(returnStatObj)[keyIndex]];

                                    //3. Loop the array to generate the table HTML for all values inside the Statistics object
                                    detailsInfoStr = detailsInfoStr + "<tr><td>" + this.getValueTableContents(Object.keys(returnStatObj)[keyIndex], valueTemp) + "</td></tr>";
                                }
                            }
                        }

                        //create the table HTML to display Statistics
                        this.viewDetailsTable.innerHTML = detailsInfoStr;
                    }
                }

            },

            //3. The function to loop the array to generate the table HTML for all values inside the Statistics object
            getValueTableContents: function (key, valueTemp) {
                var htmlTemp = "";
                if (typeof valueTemp === "object") {
                    htmlTemp = htmlTemp + "<strong>" + key + ":</strong>";
                    if (valueTemp.length > 0) {
                        for (var childIndex in valueTemp) {
                            htmlTemp = htmlTemp + "<br/>" + this.getValueTableContents(childIndex, valueTemp[childIndex]);
                        }
                    } else {
                        htmlTemp = htmlTemp + "<br/>" + valueTemp.toString();
                    }

                } else if (typeof valueTemp === "number") {
                    htmlTemp = htmlTemp + "<br/><strong>" + key + ":&nbsp</strong>" + valueTemp.toString();
                }
                return htmlTemp;
            },

            /*****************************************************************************************
             *
             *	Define the select from the map function.
             *
             ****************************************************************************************/

            drawCentoridPoint: null,
            drawDistance: null,

            //Define the click event for the select on the map button
            _onIconSelected: function (target, geotype, commontype) {

                this.clearAllParams(true, false);
                this.drawBox.clear();
            },

            //Define the draw end call back function when you have a circle on the map
            //1.We first get the centroid of the circle,
            //2.Then calculate the radius based on the centroid point and any points on the circle
            //3.Then we project the centroid point to lat & long
            //4.Then call the API find function with lat & long & distance as parameters.
            _onDrawEnd: function (graphic, geotype, commontype) {

                var geometry = graphic.geometry;
                if (geometry.geoType === 'CIRCLE') {

                    //After you draw a circle on the map,                   
                    //use this function to get the circle centorid
                    this.drawCentoridPoint = geometry.getCentroid();

                    //use this function to get any point on the circle, and use it as the second point to caculate the radius
                    var secondPoint = new esri.geometry.Point(geometry.rings[0][0], this.map.spatialReference);

                    //Define the distance caculation function
                    var distParams = new esri.tasks.DistanceParameters();
                    distParams.distanceUnit = GeometryService.UNIT_METER;
                    distParams.geometry1 = geometry.getCentroid();
                    distParams.geometry2 = secondPoint;
                    distParams.geodesic = true;

                    //after you have two points, use geometryService to calculate the radius, which is the distance of these two points
                    dojo.connect(this.geometryService, "onDistanceComplete", dojo.hitch(this, "distanceCallback"));
                    this.geometryService.distance(distParams);

                    this.drawBox.deactivate();
                    this.drawBox.clear();
                }


            },
            //Define the distance call back function
            //After you get the distance, you need to project the centroid point to lat & long form map coordinates
            distanceCallback: function (distance) {
                this.drawDistance = distance;

                //This is the lat & long default spatial reference 4326 Web Mercator
                var outSR = new esri.SpatialReference(4326);
                var params = new esri.tasks.ProjectParameters();
                params.geometries = [this.drawCentoridPoint];
                params.outSR = outSR;

                //Call the project function in geometryService to project the centorid point
                dojo.connect(this.geometryService, "onProjectComplete", dojo.hitch(this, "projectCallback"));
                this.geometryService.project(params);

            },

            //Define the projection call back function
            //You need to project the points you get from ESRI, since they are genereated based on the map's spatial reference which is 102110 as default
            //Project it to lat & long which has spatial reference as 4326 Web Mercator
            projectCallback: function (projectedPoints) {

                if (projectedPoints) {
                    if (projectedPoints.length == 1) {
                        //After you have the projected lat&long as centorid, you also have the radius as distance.
                        //You can call the Find function from the API then.
                        this.findAllRecord(projectedPoints[0].y, projectedPoints[0].x, this.drawDistance, false);
                    }
                }

            },




            /***************************************************************************************
             *
             * Button click events
             *
             ***************************************************************************************/

            selectedDetailIndex: 0,

            //Define the search and clear button events on the main page/////
            _onBtnSearchRecord: function (evt) {
                var lat = this.inputLatitude.value;
                var long = this.inputLongitude.value;
                var radius = this.inputRadius.value;
                this.clearAllParams(true, true);
                if (this.isNotNull(lat) && this.isNotNull(long) && this.isNotNull(radius)) {
                    this.findAllRecord(lat, long, radius, false);
                }

            },

            _onBtnClearAllClicked: function () {
                this.clearAllParams(true, true);
            },

            //Define the previous, next, and close button events on the detail page/////
            _onBtnCloseDetailsClicked: function () {

                html.setStyle(this.selectedRecordDiv, 'display', 'block');
                html.setStyle(this.detailsPanel, 'display', 'none');
                this.selectedDetailIndex = -1;
            },

            _onBtnPrevDetailsClicked: function () {

                if (this.selectedDetailIndex > 0) {
                    this.loadDetailsPanel(this.selectedDetailIndex - 1);
                } else {
                    this.PrevBtn.enable = false;
                }

            },

            _onBtnNextDetailsClicked: function () {

                if (this.selectedDetailIndex <= this.selectRecordList.length - 1) {
                    this.loadDetailsPanel(this.selectedDetailIndex + 1);
                }
            },

            //Define the hover and click functions on the selected table/////
            _onResultsHover: function (evt) {

                var target = evt.target || evt.srcElement;
                var index = 0;
                index = this.getTableItemIndex(target);
                if (index != undefined) {
                    if ((index == 0) || (index > 0)) {
                        if (this.selectRecordList.length > 0) {
                            this._updateSelectedGeometry(this.selectRecordList[index], true);
                        }

                    }
                }
            },

            _onResultsClicked: function (evt) {
                var target = evt.target || evt.srcElement;
                var index = 0;
                index = this.getTableItemIndex(target);

                if (index != undefined) {
                    if ((index == 0) || (index > 0)) {
                        if (this.selectRecordList.length > 0) {
                            this.loadDetailsPanel(index);
                        }
                    }
                }
            },

            //Define the clear all functions for graphics on the map, data on the detail panel, and also data on the selected table/////
            clearAllParams: function (clearAllRecords, clearDrawbox) {

                html.setStyle(this.selectedRecordDiv, 'display', 'block');
                html.setStyle(this.detailsPanel, 'display', 'none');
                html.setStyle(this.alertInputError, 'display', 'none');

                if (clearDrawbox) {
                    if (this.drawBox) {
                        this.drawBox.clear();
                        this.drawBox.deactivate();
                    }
                }

                if (clearAllRecords) {
                    this.selectedPointLayer.clear();
                    this.selectRecordList = [];
                    this.selectTableAttrList = [];
                    $('#' + this.selectedTableID).bootstrapTable('load', this.selectTableAttrList);
                }

                this.selectedHighlightedLayer.clear();

            },


            /***************************************************************************************
             *
             * Detail Panel functions
             *
             ***************************************************************************************/

            //Define the load detail panel functions includes image and statustics////////////////////////////////////
            loadDetailsPanel: function (index) {
                this.selectedDetailIndex = parseInt(index);

                //Show details panel
                html.setStyle(this.selectedRecordDiv, 'display', 'none');
                html.setStyle(this.detailsPanel, 'display', 'block');

                //Get details Values from saved list
                var itemFeature = this.selectRecordList[this.selectedDetailIndex];
                var selectedPropertyID = itemFeature.attributes.propertyId;

                if (this.isNotNull(selectedPropertyID)) {
                    //load image to panel
                    this.displayImage(selectedPropertyID);
                    //load statustic to panel                   
                    this.getStatistics(selectedPropertyID, this.inputRadius.value);
                    this.lblPropertyID.innerHTML = "<strong>Property ID:</strong> " + selectedPropertyID;
                }

                //disable prev or next button based on the current index
                if (this.selectedDetailIndex == 0) {
                    html.setStyle(this.PrevBtn, 'display', 'none');
                } else {
                    html.setStyle(this.PrevBtn, 'display', 'block');
                }
                if (this.selectedDetailIndex == this.selectRecordList.length - 1) {
                    html.setStyle(this.NextBtn, 'display', 'none');
                } else {
                    html.setStyle(this.NextBtn, 'display', 'block');

                }

                //hightlight the geometry
                if (index >= 0) {
                    if (this.selectRecordList.length > 0) {
                        this._updateSelectedGeometry(this.selectRecordList[index], true);
                    }

                }

            },


            /*****************************************************************************************
             *
             *	Define the helper function.
             *
             ****************************************************************************************/

            //Define the get widget by classname function.////////////////////////////////////
            getWidget: function (comboWidgetClass) {
                return dojo.query('.' + comboWidgetClass, this.domNode)[0];
            },

            //Define the get item index when user hover or click the table////////////////////////////////////
            getTableItemIndex: function (target) {
                var index = 0;
                if (target.dataset.index != undefined) {
                    index = target.dataset.index;
                } else if (target.parentElement.dataset.index != undefined) {
                    index = target.parentElement.dataset.index;
                } else if (target.parentElement.parentElement.dataset.index != undefined) {
                    index = target.parentElement.parentElement.dataset.index;
                } else if (target.parentElement.parentElement.parentElement.dataset.index != undefined) {
                    index = target.parentElement.parentElement.parentElement.dataset.index
                } else if (target.parentElement.parentElement.parentElement.dataset.index != undefined) {
                    index = target.parentElement.parentElement.parentElement.dataset.index
                } else if (target.parentElement.parentElement.parentElement.parentElement.dataset.index != undefined) {
                    index = target.parentElement.parentElement.parentElement.parentElement.dataset.index
                } else if (target.rowIndex != undefined) {
                    index = target.rowIndex;
                } else if (target.parentElement.rowIndex != undefined) {
                    index = target.parentElement.rowIndex;
                } else if (target.parentElement.parentElement.rowIndex != undefined) {
                    index = target.parentElement.parentElement.rowIndex;
                } else if (target.parentElement.parentElement.parentElement.rowIndex != undefined) {
                    index = target.parentElement.parentElement.parentElement.rowIndex;
                } else if (target.parentElement.parentElement.parentElement.parentElement.rowIndex != undefined) {
                    index = target.parentElement.parentElement.parentElement.parentElement.rowIndex;
                }
                return index;
            },

            //HTTP REQUEST TO WEB SERVICES//////////////////////////////////////
            requester: null,
            getRequester: function () {
                var requester;
                try {
                    requester = new ActiveXObject("Microsoft.XMLHTTP");
                } catch (e) {
                    requester = new XMLHttpRequest();
                }
                return requester;
            },

            //Check null object//////////////////////////////////////
            isNotNull: function (obj) {
                if (obj != null && obj != undefined) {
                    if (typeof obj === "object") {
                        return true;
                    } else if (obj.length > 0) {
                        return true;
                    }
                }
                return false;
            }


        });
    });
