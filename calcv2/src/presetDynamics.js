/**
 * GENERATED FILE — do not hand-edit. Regenerate: node tools/gen-preset-dynamics.mjs
 * (M6 stage 2, hybrid geometry inheritance: preset dynamics records precomputed
 * at bake time; asset-hash guarded by the estimator fixture suite.)
 *
 * Raw values are MESH UNITS — scale at page time via scaleGeometryRecord()
 * (dynamicsGeometry.js) with the inherited length. Proxies are scale-free.
 * Generated 2026-08-17.
 */
export const PRESET_DYNAMICS = {
  "sunship": {
    "id": "sunship",
    "source": "corpus-obj(Sunship.obj)",
    "glbSha256": "5bb5e708aebae75e466759bfb6dcf2425ad1d7940d7bdb055bbf723f0b16b414",
    "objSha256": "dee482af0af99bd01cb5002cae61c969dba114a9b2ca67e336e8a00fd18d3e64",
    "aeroObj": null,
    "defaultAxis": "+Z",
    "raw": {
      "extents": [
        0.810716,
        0.771919,
        0.978248
      ],
      "frontalRaw": {
        "X": 0.610330355552,
        "Y": 0.6201412679200001,
        "Z": 0.43087055881800007
      },
      "wettedRaw": 2.1988511464721703,
      "hullRaw": 2.1957449389128123,
      "meshRaw": 2.1988511464721703,
      "wettedSource": "mesh",
      "volumeRaw": 0.2803528527244083,
      "volumeSource": "convex-envelope",
      "warnings": []
    },
    "proxies": {
      "+X": {
        "proxy": 0.802158781195433,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.00006760347084237472,
          "softAft": 0.802158781195433,
          "terminalBaseFrac": 0.0012360939431396785,
          "rawRatio": 1,
          "shoulder": 0.16639781430349784
        },
        "oddFraction": 0
      },
      "-X": {
        "proxy": 0.802158781195433,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.00006760347084237472,
          "softAft": 0.802158781195433,
          "terminalBaseFrac": 0.0012360939431396785,
          "rawRatio": 1,
          "shoulder": 0.16639781430349784
        },
        "oddFraction": 0
      },
      "+Y": {
        "proxy": 0.6546142525677576,
        "cls": "rounded",
        "triggers": {
          "softFore": 0.31453266643883765,
          "softAft": 0.6546142525677576,
          "terminalBaseFrac": 0.0012153621779290229,
          "rawRatio": 1,
          "shoulder": 0.050344763754109643
        },
        "oddFraction": 0
      },
      "-Y": {
        "proxy": 0.9924440648653761,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.00008894495549685351,
          "softAft": 0.9924440648653761,
          "terminalBaseFrac": 0.3437044239183277,
          "rawRatio": 1,
          "shoulder": 0.21238000053217163
        },
        "oddFraction": 0
      },
      "+Z": {
        "proxy": 0.7697920595614333,
        "cls": "rounded",
        "triggers": {
          "softFore": 0.004553551463451261,
          "softAft": 0.7697920595614333,
          "terminalBaseFrac": 0.004453538757823785,
          "rawRatio": 1,
          "shoulder": 0.10151579449816793
        },
        "oddFraction": 0
      },
      "-Z": {
        "proxy": 0.7697920595614333,
        "cls": "rounded",
        "triggers": {
          "softFore": 0.004553551463451261,
          "softAft": 0.7697920595614333,
          "terminalBaseFrac": 0.004453538757823785,
          "rawRatio": 1,
          "shoulder": 0.10151579449816793
        },
        "oddFraction": 0
      }
    }
  },
  "cigar": {
    "id": "cigar",
    "source": "aero-hull(lab/cigar-aerohull-candidate.obj)",
    "glbSha256": "55f41a9bc09c575b59ea3a3e0e6c59fe9516699e7751ab5ca7fd32a681d7063d",
    "objSha256": "2a2c7a33c50958b589c543d29b4b8f6e4c802ee81b6196638c946c4f12e1cf77",
    "aeroObj": "lab/cigar-aerohull-candidate.obj",
    "defaultAxis": "+X",
    "raw": {
      "extents": [
        100,
        20,
        20
      ],
      "frontalRaw": {
        "X": 313.2628413643999,
        "Y": 1607.8071375000002,
        "Z": 1607.8071375000004
      },
      "wettedRaw": 5189.779550503826,
      "hullRaw": 5189.779550503804,
      "meshRaw": 5189.779550503826,
      "wettedSource": "mesh",
      "volumeRaw": 22705.689496844116,
      "volumeSource": "convex-envelope",
      "warnings": []
    },
    "proxies": {
      "+X": {
        "proxy": 0.04487323070020768,
        "cls": "rounded",
        "triggers": {
          "softFore": 0.0010662643714619195,
          "softAft": 0.04487323070020768,
          "terminalBaseFrac": 0.00019924287706714485,
          "rawRatio": 1,
          "shoulder": 0.027498791473955293
        },
        "oddFraction": 0
      },
      "-X": {
        "proxy": 0.6681134713125567,
        "cls": "rounded",
        "triggers": {
          "softFore": 0,
          "softAft": 0.6681134713125567,
          "terminalBaseFrac": 0.03187886033074318,
          "rawRatio": 1,
          "shoulder": 0.1277061831367696
        },
        "oddFraction": 0
      },
      "+Y": {
        "proxy": 0.9341083496905879,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.14466510109266506,
          "softAft": 0.9341083496905879,
          "terminalBaseFrac": 0.06799417192812045,
          "rawRatio": 1,
          "shoulder": 0.513165491557998
        },
        "oddFraction": 0
      },
      "-Y": {
        "proxy": 0.9341083496905879,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.14466510109266506,
          "softAft": 0.9341083496905879,
          "terminalBaseFrac": 0.06799417192812045,
          "rawRatio": 1,
          "shoulder": 0.513165491557998
        },
        "oddFraction": 0
      },
      "+Z": {
        "proxy": 0.9341083496905879,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.14466510109266506,
          "softAft": 0.9341083496905879,
          "terminalBaseFrac": 0.06799417192812045,
          "rawRatio": 1,
          "shoulder": 0.513165491557998
        },
        "oddFraction": 0
      },
      "-Z": {
        "proxy": 0.9341083496905879,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.14466510109266506,
          "softAft": 0.9341083496905879,
          "terminalBaseFrac": 0.06799417192812045,
          "rawRatio": 1,
          "shoulder": 0.513165491557998
        },
        "oddFraction": 0
      }
    }
  },
  "bottle": {
    "id": "bottle",
    "source": "convex-hull(corpus Bottle.obj)",
    "glbSha256": "f26de3ede2304b06b7841a5c4d8320f17640ad2a83c6057ed2ca4ad2a169a1b8",
    "objSha256": "05bc2f2e391b9af2e451a8bda769a9c3c6b515b996c26a2d40c2e96265147e48",
    "aeroObj": null,
    "defaultAxis": "-Y",
    "raw": {
      "extents": [
        0.559204,
        1.956255,
        0.559204
      ],
      "frontalRaw": {
        "X": 0.9344567562340002,
        "Y": 0.22986816899999998,
        "Z": 0.934456756234
      },
      "wettedRaw": 3.138520597035093,
      "hullRaw": 3.138520597035093,
      "meshRaw": 3.138520597035093,
      "wettedSource": "mesh",
      "volumeRaw": 0.34231232914059756,
      "volumeSource": "convex-envelope",
      "warnings": []
    },
    "proxies": {
      "+X": {
        "proxy": 0.9771012765532581,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.06720992047355,
          "softAft": 0.9771012765532581,
          "terminalBaseFrac": 0.001831196936906942,
          "rawRatio": 1.0000000010735532,
          "shoulder": 0.28009665837625586
        },
        "oddFraction": 0
      },
      "-X": {
        "proxy": 0.9771012765532581,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.06720992047355,
          "softAft": 0.9771012765532581,
          "terminalBaseFrac": 0.001831196936906942,
          "rawRatio": 1.0000000010735532,
          "shoulder": 0.28009665837625586
        },
        "oddFraction": 0
      },
      "+Y": {
        "proxy": 0.5311070302844244,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.5311070302844244,
          "softAft": 0.1666817957296597,
          "terminalBaseFrac": 0.11903246339910885,
          "rawRatio": 1,
          "shoulder": 0.13456784640460187
        },
        "oddFraction": 0
      },
      "-Y": {
        "proxy": 0.9046548268574667,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.05744376660624181,
          "softAft": 0.9046548268574667,
          "terminalBaseFrac": 0.6957352005092298,
          "rawRatio": 1,
          "shoulder": 0
        },
        "oddFraction": 0
      },
      "+Z": {
        "proxy": 0.9771012765532581,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.06720992047355,
          "softAft": 0.9771012765532581,
          "terminalBaseFrac": 0.001831196936906942,
          "rawRatio": 1.0000000010735532,
          "shoulder": 0.28009665837625586
        },
        "oddFraction": 0
      },
      "-Z": {
        "proxy": 0.9771012765532581,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.06720992047355,
          "softAft": 0.9771012765532581,
          "terminalBaseFrac": 0.001831196936906942,
          "rawRatio": 1.0000000010735532,
          "shoulder": 0.28009665837625586
        },
        "oddFraction": 0
      }
    }
  },
  "car": {
    "id": "car",
    "source": "convex-hull(corpus car.obj)",
    "glbSha256": "bba8628ed72796e29886f1e4569ecbf6387efb435274df842e959d75275efa10",
    "objSha256": "8003e51077fee54477d161150351a29c9a6cf8ee6f4d448b88e7b1fa23f50028",
    "aeroObj": null,
    "defaultAxis": "+Z",
    "raw": {
      "extents": [
        0.546894,
        0.648774,
        1.894998
      ],
      "frontalRaw": {
        "X": 1.0105534009019999,
        "Y": 1.036363036212,
        "Z": 0.35312704980599996
      },
      "wettedRaw": 4.417705601795988,
      "hullRaw": 4.417705601795988,
      "meshRaw": 4.417705601795988,
      "wettedSource": "mesh",
      "volumeRaw": 0.5503490526567777,
      "volumeSource": "convex-envelope",
      "warnings": []
    },
    "proxies": {
      "+X": {
        "proxy": 1,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.8420945812398086,
          "softAft": 1,
          "terminalBaseFrac": 0.8437849944008958,
          "rawRatio": 1,
          "shoulder": 1.1064692761133843
        },
        "oddFraction": 0
      },
      "-X": {
        "proxy": 1,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.8420945812398086,
          "softAft": 1,
          "terminalBaseFrac": 0.8437849944008958,
          "rawRatio": 1,
          "shoulder": 1.1064692761133843
        },
        "oddFraction": 0
      },
      "+Y": {
        "proxy": 1.0000000000000002,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.5491874758583432,
          "softAft": 1.0000000000000002,
          "terminalBaseFrac": 0.325,
          "rawRatio": 1,
          "shoulder": 0.48535929506062603
        },
        "oddFraction": 0
      },
      "-Y": {
        "proxy": 1,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.3064608558325951,
          "softAft": 1,
          "terminalBaseFrac": 0.5739130434782609,
          "rawRatio": 1,
          "shoulder": 0.6382849015729584
        },
        "oddFraction": 0
      },
      "+Z": {
        "proxy": 0.4340132553054296,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.3145088638931401,
          "softAft": 0.4340132553054296,
          "terminalBaseFrac": 0.4140061791967044,
          "rawRatio": 1,
          "shoulder": 0.07901705305042046
        },
        "oddFraction": 0
      },
      "-Z": {
        "proxy": 0.4340132553054296,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.3145088638931401,
          "softAft": 0.4340132553054296,
          "terminalBaseFrac": 0.4140061791967044,
          "rawRatio": 1,
          "shoulder": 0.07901705305042046
        },
        "oddFraction": 0
      }
    }
  },
  "washingmachine": {
    "id": "washingmachine",
    "source": "corpus-obj(washingmachine.obj)",
    "glbSha256": "da4c6c7d356067fc28588857bd1839b83c2a135d0df18f56f588b89b77be7824",
    "objSha256": "7ebc8c97e8e54e6090756fef6f3697cdab6c5c50e60be487adaccd1d1da07020",
    "aeroObj": null,
    "defaultAxis": "+Y",
    "raw": {
      "extents": [
        0.5,
        0.639049,
        0.531849
      ],
      "frontalRaw": {
        "X": 0.33033083385100004,
        "Y": 0.2659245,
        "Z": 0.3195245
      },
      "wettedRaw": 1.812466192202,
      "hullRaw": 1.8160578716579894,
      "meshRaw": 1.812466192202,
      "wettedSource": "mesh",
      "volumeRaw": 0.16516541692550002,
      "volumeSource": "convex-envelope",
      "warnings": []
    },
    "proxies": {
      "+X": {
        "proxy": 1,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.9550429783213737,
          "softAft": 1,
          "terminalBaseFrac": 1,
          "rawRatio": 1,
          "shoulder": 0
        },
        "oddFraction": 0
      },
      "-X": {
        "proxy": 1,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.9550429783213737,
          "softAft": 1,
          "terminalBaseFrac": 1,
          "rawRatio": 1,
          "shoulder": 0
        },
        "oddFraction": 0
      },
      "+Y": {
        "proxy": 1,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.8764329760276652,
          "softAft": 1,
          "terminalBaseFrac": 1,
          "rawRatio": 1,
          "shoulder": 0.202506474752244
        },
        "oddFraction": 0
      },
      "-Y": {
        "proxy": 1,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.936896527842396,
          "softAft": 1,
          "terminalBaseFrac": 0.9375,
          "rawRatio": 1,
          "shoulder": 0.552074034090815
        },
        "oddFraction": 0
      },
      "+Z": {
        "proxy": 1.0000000000000002,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.9521207763154153,
          "softAft": 1.0000000000000002,
          "terminalBaseFrac": 0.0625,
          "rawRatio": 1,
          "shoulder": 1.5188967656467036
        },
        "oddFraction": 0
      },
      "-Z": {
        "proxy": 1,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.345785132650348,
          "softAft": 1,
          "terminalBaseFrac": 1,
          "rawRatio": 1,
          "shoulder": 1.4162011771232745
        },
        "oddFraction": 0
      }
    }
  },
  "aerosmena": {
    "id": "aerosmena",
    "source": "convex-hull(corpus Aerosmena.obj)",
    "glbSha256": "9e42adc8b4a90196415e459f2bc5ab2e3caf1299e01eca6b1673a8d6ff6f8dbf",
    "objSha256": "d5140eff3e51cfe3d7fd155866025f66261f3504b25e3896922f414b80d0f035",
    "aeroObj": null,
    "defaultAxis": "+Z",
    "raw": {
      "extents": [
        1.989698,
        0.859802,
        1.989698
      ],
      "frontalRaw": {
        "X": 1.285705168295,
        "Y": 3.030011358692,
        "Z": 1.2857051004079998
      },
      "wettedRaw": 7.644929497093231,
      "hullRaw": 7.644929497093231,
      "meshRaw": 7.644929497093231,
      "wettedSource": "mesh",
      "volumeRaw": 1.58088821763835,
      "volumeSource": "convex-envelope",
      "warnings": []
    },
    "proxies": {
      "+X": {
        "proxy": 0.6852949245412392,
        "cls": "rounded",
        "triggers": {
          "softFore": 0.0000014092993172383559,
          "softAft": 0.6852949245412392,
          "terminalBaseFrac": 0.002161383285302594,
          "rawRatio": 1,
          "shoulder": 0.07941541599764392
        },
        "oddFraction": 0
      },
      "-X": {
        "proxy": 0.6852949245412392,
        "cls": "rounded",
        "triggers": {
          "softFore": 0.0000014092993172383559,
          "softAft": 0.6852949245412392,
          "terminalBaseFrac": 0.002161383285302594,
          "rawRatio": 1,
          "shoulder": 0.07941541599764392
        },
        "oddFraction": 0
      },
      "+Y": {
        "proxy": 0.9953983891532359,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.15157765360917405,
          "softAft": 0.9953983891532359,
          "terminalBaseFrac": 0.004485219164118246,
          "rawRatio": 1,
          "shoulder": 0.6668952705424304
        },
        "oddFraction": 0
      },
      "-Y": {
        "proxy": 1,
        "cls": "pinned",
        "triggers": {
          "softFore": 0.04504271807036304,
          "softAft": 1,
          "terminalBaseFrac": 0.1616717635066259,
          "rawRatio": 1,
          "shoulder": 0.23512942901395698
        },
        "oddFraction": 0
      },
      "+Z": {
        "proxy": 0.6852949245412392,
        "cls": "rounded",
        "triggers": {
          "softFore": 0.0000014092993172383559,
          "softAft": 0.6852949245412392,
          "terminalBaseFrac": 0.002161383285302594,
          "rawRatio": 1,
          "shoulder": 0.07941541599764392
        },
        "oddFraction": 0
      },
      "-Z": {
        "proxy": 0.6852949245412392,
        "cls": "rounded",
        "triggers": {
          "softFore": 0.0000014092993172383559,
          "softAft": 0.6852949245412392,
          "terminalBaseFrac": 0.002161383285302594,
          "rawRatio": 1,
          "shoulder": 0.07941541599764392
        },
        "oddFraction": 0
      }
    }
  }
};
