// frontend/src/data/blockExamples.js
//
// One runnable, hand-verified interactive example per block in the glossary.
// Each entrys workspaceState is a real Blockly serialization, produced and
// verified programmatically end to end (built, python-generated, and
// executed) so every example is guaranteed to load and run without errors.
//
// goal / role / interaction are the beginner-friendly explanation shown
// alongside the example: what it is trying to accomplish, what part this
// specific block plays, and how it works together with the other blocks.

export const BLOCK_EXAMPLES = {
  "controls_if": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "4w0@Pk-htJfm%J$A)Hzc",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "L-SB:D_MDTP)`7(iDt5%"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "m.]),22|)RW;zX0_U9nM",
                  "fields": {
                    "NUM": 20
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "controls_if",
                "id": "xRASm(B!m2C*i2HWra~j",
                "inputs": {
                  "IF0": {
                    "block": {
                      "type": "logic_compare",
                      "id": "(SbX2Or29)//IX|Q?rpT",
                      "fields": {
                        "OP": "GTE"
                      },
                      "inputs": {
                        "A": {
                          "block": {
                            "type": "variables_get",
                            "id": "8L$?9x.@kL[3h:Zlp@uP",
                            "fields": {
                              "VAR": {
                                "id": "L-SB:D_MDTP)`7(iDt5%"
                              }
                            }
                          }
                        },
                        "B": {
                          "block": {
                            "type": "math_number",
                            "id": "3|x2Zm(wv_sW*w#Z!!%i",
                            "fields": {
                              "NUM": 18
                            }
                          }
                        }
                      }
                    }
                  },
                  "DO0": {
                    "block": {
                      "type": "text_print",
                      "id": "ddLui(VmqE/t3A2j1tEr",
                      "inputs": {
                        "TEXT": {
                          "block": {
                            "type": "text",
                            "id": "G}FIB%$/fMRJhMSz/y()",
                            "fields": {
                              "TEXT": "You can vote!"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "age",
          "id": "L-SB:D_MDTP)`7(iDt5%"
        },
        {
          "name": "item",
          "id": "#jSfND]Lyb287R5uhF?$"
        }
      ]
    },
    "pythonPreview": "age = None\n\n\nage = 20\n\nif age >= 18:\n  print('You can vote!')",
    "goal": "Decide whether someone is old enough to vote.",
    "role": "The If/Else block is the decision point: it only runs the Print block when the condition is true.",
    "interaction": "It reads the result of the Compare block (age \u2265 18) and only runs its inner blocks when that comparison is True."
  },
  "logic_compare": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "}c8u+zJq~O1v*YBR9pn_",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "D9w13nOgMg#:ZhONlSzT"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "m%md;P$TG:98cn8#r_K}",
                  "fields": {
                    "NUM": 75
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "w1}]P+!ca^6OxR5mVZp$",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "logic_compare",
                      "id": "Nctjq8MGSe@Mtymq37pB",
                      "fields": {
                        "OP": "GTE"
                      },
                      "inputs": {
                        "A": {
                          "block": {
                            "type": "variables_get",
                            "id": "yXpmaPgsW,57FK9RdS/|",
                            "fields": {
                              "VAR": {
                                "id": "D9w13nOgMg#:ZhONlSzT"
                              }
                            }
                          }
                        },
                        "B": {
                          "block": {
                            "type": "math_number",
                            "id": "*+Wxw00)8obE1d)?U?4t",
                            "fields": {
                              "NUM": 60
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "score",
          "id": "D9w13nOgMg#:ZhONlSzT"
        },
        {
          "name": "item",
          "id": "5?nrS[[iTxXgf[X=Ih3f"
        }
      ]
    },
    "pythonPreview": "score = None\n\n\nscore = 75\nprint(score >= 60)",
    "goal": "Check whether a test score counts as a passing grade.",
    "role": "The Compare block is the star: it takes two numbers and produces a True/False answer.",
    "interaction": "It takes the score variable and the number 60 as its two inputs, and its True/False output is fed straight into Print."
  },
  "logic_operation": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "O}yF!]EE=O8%tq2M_?6p",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "WM)KLY/10Cod}OnNLkQm"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "2e0fLAKnp@s$5!$$l8RI",
                  "fields": {
                    "NUM": 25
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "controls_if",
                "id": "C0Z]nPZR}f|/8]}9lxL{",
                "inputs": {
                  "IF0": {
                    "block": {
                      "type": "logic_operation",
                      "id": "`blf8!!lkEPL-zF@a6zj",
                      "fields": {
                        "OP": "AND"
                      },
                      "inputs": {
                        "A": {
                          "block": {
                            "type": "logic_compare",
                            "id": "9b1^`T8K]SPCa^Ljg]8.",
                            "fields": {
                              "OP": "GTE"
                            },
                            "inputs": {
                              "A": {
                                "block": {
                                  "type": "variables_get",
                                  "id": "W,0W_nqfOna-5y2RYF2Y",
                                  "fields": {
                                    "VAR": {
                                      "id": "WM)KLY/10Cod}OnNLkQm"
                                    }
                                  }
                                }
                              },
                              "B": {
                                "block": {
                                  "type": "math_number",
                                  "id": "E/w^R6*W^[0ES_S+dIMs",
                                  "fields": {
                                    "NUM": 18
                                  }
                                }
                              }
                            }
                          }
                        },
                        "B": {
                          "block": {
                            "type": "logic_compare",
                            "id": "htz=q-Pcr%eQ=WV{yJk0",
                            "fields": {
                              "OP": "LT"
                            },
                            "inputs": {
                              "A": {
                                "block": {
                                  "type": "variables_get",
                                  "id": "iXhy1zltV*byp8RoJF63",
                                  "fields": {
                                    "VAR": {
                                      "id": "WM)KLY/10Cod}OnNLkQm"
                                    }
                                  }
                                }
                              },
                              "B": {
                                "block": {
                                  "type": "math_number",
                                  "id": "VE)5;4cDS5H,t::3:j]d",
                                  "fields": {
                                    "NUM": 65
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "DO0": {
                    "block": {
                      "type": "text_print",
                      "id": "WI`DVdhZ-*t/WxbOr.aX",
                      "inputs": {
                        "TEXT": {
                          "block": {
                            "type": "text",
                            "id": "[z%($J%/FY1UW5=Gda%R",
                            "fields": {
                              "TEXT": "Working-age adult"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "age",
          "id": "WM)KLY/10Cod}OnNLkQm"
        },
        {
          "name": "item",
          "id": "M|]`EtFHWw-u/+;(F;Kt"
        }
      ]
    },
    "pythonPreview": "age = None\n\n\nage = 25\n\nif age >= 18 and age < 65:\n  print('Working-age adult')",
    "goal": "Check whether someone counts as a 'working-age adult' (two conditions must both be true).",
    "role": "The And/Or block combines two separate Compare blocks into one final True/False answer.",
    "interaction": "It takes the outputs of two Compare blocks (age\u226518 and age<65) as its A and B inputs, and its combined result decides whether the If block runs."
  },
  "logic_in": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "*(3k/lGB$RTP)lhy3QTn",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "y?jRWp0qvwY_Lt_HPhzK"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "dj?Z`(vR!r_38?.(X}G0",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "U`YG-?]w_j@OHQYq$:L{",
                        "fields": {
                          "TEXT": "apple"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "_f01mzZ),39Zqc-9l?Q6",
                        "fields": {
                          "TEXT": "banana"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "DL-bts6Z[D{y!?;;cZT2",
                        "fields": {
                          "TEXT": "mango"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "XcaasDET]1qp$dT_qk-!",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "logic_in",
                      "id": "(?DoQ!R_;v[BlE,@w8-`",
                      "inputs": {
                        "ITEM": {
                          "block": {
                            "type": "text",
                            "id": ",sb]Pqe69TPwt]t$n1L_",
                            "fields": {
                              "TEXT": "banana"
                            }
                          }
                        },
                        "COLLECTION": {
                          "block": {
                            "type": "variables_get",
                            "id": "PfKB*Lo~8(tF2FSim|rM",
                            "fields": {
                              "VAR": {
                                "id": "y?jRWp0qvwY_Lt_HPhzK"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "fruits",
          "id": "y?jRWp0qvwY_Lt_HPhzK"
        },
        {
          "name": "item",
          "id": "D@bW,^VxT@onv$[)IoP1"
        }
      ]
    },
    "pythonPreview": "fruits = None\n\n\nfruits = ['apple', 'banana', 'mango']\nprint('banana' in fruits)",
    "goal": "Check whether 'banana' is included in a list of fruits.",
    "role": "The Is In block is doing the searching \u2014 it scans the whole collection for you.",
    "interaction": "It takes a single item and a list as its two inputs and outputs True/False, which is printed directly."
  },
  "logic_negate": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "0a!pLeWWnB,?PKqw/`t1",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": ":)||ZB,NRbX17l~8i,_g"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "logic_boolean",
                  "id": "J9-ccw=H$*p#$:?G|C]?",
                  "fields": {
                    "BOOL": "FALSE"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "controls_if",
                "id": "#n0Af}x9f~PlpB#}}oJL",
                "inputs": {
                  "IF0": {
                    "block": {
                      "type": "logic_negate",
                      "id": "!9^a-4WS;_*8t0D/MTBn",
                      "inputs": {
                        "BOOL": {
                          "block": {
                            "type": "variables_get",
                            "id": "nONPM(q^]mi;iet_.$gy",
                            "fields": {
                              "VAR": {
                                "id": ":)||ZB,NRbX17l~8i,_g"
                              }
                            }
                          }
                        }
                      }
                    }
                  },
                  "DO0": {
                    "block": {
                      "type": "text_print",
                      "id": "*]dP)Ho7MgBV1}Ko^pVE",
                      "inputs": {
                        "TEXT": {
                          "block": {
                            "type": "text",
                            "id": "}-*tIu*ko@@dZk3i=eZ}",
                            "fields": {
                              "TEXT": "Great day for a walk!"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "is_raining",
          "id": ":)||ZB,NRbX17l~8i,_g"
        },
        {
          "name": "item",
          "id": "3hg~e_}-RVORY@+qrm6a"
        }
      ]
    },
    "pythonPreview": "is_raining = None\n\n\nis_raining = False\n\nif not is_raining:\n  print('Great day for a walk!')",
    "goal": "Decide it's a good day for a walk, based on it NOT raining.",
    "role": "The Not block flips the is_raining flag so the If block reacts to the opposite condition.",
    "interaction": "It takes the is_raining variable as its single input and outputs the reversed Boolean into the If block's condition."
  },
  "logic_boolean": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "|7AjCtZ]:%Pf2j;*C^wX",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "g|u_HDu80=|N!nn44$t]"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "logic_boolean",
                  "id": "iWe!Pv?OA^k`8*a/mncS",
                  "fields": {
                    "BOOL": "FALSE"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "VPKz`M@40Mv0jk#v%?2!",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "variables_get",
                      "id": "m_,]?ClnoY-}GzL?DBBP",
                      "fields": {
                        "VAR": {
                          "id": "g|u_HDu80=|N!nn44$t]"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "game_over",
          "id": "g|u_HDu80=|N!nn44$t]"
        },
        {
          "name": "item",
          "id": ")ck%/IJkYi^kr(USZsCW"
        }
      ]
    },
    "pythonPreview": "game_over = None\n\n\ngame_over = False\nprint(game_over)",
    "goal": "Track whether a game has ended yet.",
    "role": "The True/False block supplies the fixed starting value for the game_over variable.",
    "interaction": "Its fixed value is stored into game_over by the Set Variable block, then read back out and printed."
  },
  "logic_null": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "$gl/2OoRr7~u0s(BtI]B",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "coEDh/EcK`+;B6YOL`$("
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "logic_null",
                  "id": "XS;+ismD5[=Z-0RHZYOU"
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "7$fyD[@JhnlnIjpG*V-}",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "logic_compare",
                      "id": "Fb`{.mvPWg*Gi^lQ+!1L",
                      "fields": {
                        "OP": "EQ"
                      },
                      "inputs": {
                        "A": {
                          "block": {
                            "type": "variables_get",
                            "id": "V{I*R@kl~LDbR+AzjWy3",
                            "fields": {
                              "VAR": {
                                "id": "coEDh/EcK`+;B6YOL`$("
                              }
                            }
                          }
                        },
                        "B": {
                          "block": {
                            "type": "logic_null",
                            "id": "F},/.d;qi#IPI0(R2f@u"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "winner",
          "id": "coEDh/EcK`+;B6YOL`$("
        },
        {
          "name": "item",
          "id": "1+Z}L6#uG0j$4F8D56S~"
        }
      ]
    },
    "pythonPreview": "winner = None\n\n\nwinner = None\nprint(winner == None)",
    "goal": "Represent that there's no winner yet in a game.",
    "role": "The None block stands in for 'nothing has happened yet'.",
    "interaction": "It's stored into the winner variable, then compared against another None block to check whether a winner has been set."
  },
  "logic_ternary": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "{_=J7M5l5TC0WXu:=#ft",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "Gg$LhQgW[GH8z}kN!06z"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "g!]lgMmUGil4Ak8kkck)",
                  "fields": {
                    "NUM": 12
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "variables_set",
                "id": ";x+.y(X4uI(|)A-eMH[j",
                "fields": {
                  "VAR": {
                    "id": "y(V#i3Z%t:q#6-+BAFT6"
                  }
                },
                "inputs": {
                  "VALUE": {
                    "block": {
                      "type": "math_number",
                      "id": "=|]Sn5R3[k2D?]K2:RK[",
                      "fields": {
                        "NUM": 7
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "lCo1NYO3bhnaaB}P})~$",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "logic_ternary",
                          "id": "zcLjH08DV9Kzhj^Q00oK",
                          "inputs": {
                            "IF": {
                              "block": {
                                "type": "logic_compare",
                                "id": "A67*lr```tP^+La,;nA=",
                                "fields": {
                                  "OP": "GT"
                                },
                                "inputs": {
                                  "A": {
                                    "block": {
                                      "type": "variables_get",
                                      "id": "j;QqSFb`p,NV/_S-aZ$P",
                                      "fields": {
                                        "VAR": {
                                          "id": "Gg$LhQgW[GH8z}kN!06z"
                                        }
                                      }
                                    }
                                  },
                                  "B": {
                                    "block": {
                                      "type": "variables_get",
                                      "id": "h:OGjG|2|qO6kz.NOopQ",
                                      "fields": {
                                        "VAR": {
                                          "id": "y(V#i3Z%t:q#6-+BAFT6"
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            },
                            "THEN": {
                              "block": {
                                "type": "variables_get",
                                "id": "`S8L_BI`kSUB$XAvN~!B",
                                "fields": {
                                  "VAR": {
                                    "id": "Gg$LhQgW[GH8z}kN!06z"
                                  }
                                }
                              }
                            },
                            "ELSE": {
                              "block": {
                                "type": "variables_get",
                                "id": "I;7SKB$C$MK1nI9yw,BO",
                                "fields": {
                                  "VAR": {
                                    "id": "y(V#i3Z%t:q#6-+BAFT6"
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "a",
          "id": "Gg$LhQgW[GH8z}kN!06z"
        },
        {
          "name": "b",
          "id": "y(V#i3Z%t:q#6-+BAFT6"
        },
        {
          "name": "item",
          "id": "E@#!bnnI!uA=A?%kc$.#"
        }
      ]
    },
    "pythonPreview": "a = None\nb = None\n\n\na = 12\nb = 7\nprint(a if a > b else b)",
    "goal": "Pick the larger of two numbers in a single line.",
    "role": "The Ternary block is doing the choosing \u2014 it's a compact stand-in for a full If/Else.",
    "interaction": "It takes a Compare block as its condition and the two variables (a, b) as its two possible results, printing whichever one 'wins'."
  },
  "python_type": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "H5@GEn#Ln!Nny2|VlZwJ",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "{/.6YQ@}h8U6Icdld;eM"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "9Iwd)}wgZpk56e#/{[o/",
                  "fields": {
                    "NUM": 3.5
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "(W85@H-R/QR=*q5KG{/,",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "python_type",
                      "id": "F#KyO)PJuvdOMLn:yR{i",
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "variables_get",
                            "id": ")2n}KR07$hxI)6Qs.r^_",
                            "fields": {
                              "VAR": {
                                "id": "{/.6YQ@}h8U6Icdld;eM"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "value",
          "id": "{/.6YQ@}h8U6Icdld;eM"
        },
        {
          "name": "item",
          "id": "3C-6l)OV=2Y:%M9g4i^m"
        }
      ]
    },
    "pythonPreview": "value = None\n\n\nvalue = 3.5\nprint(type(value))",
    "goal": "Check what kind of data a decimal number actually is.",
    "role": "The Type Of block inspects the value and reports its Python type.",
    "interaction": "It takes the value variable as input and its result (a type object) is passed straight to Print."
  },
  "python_type_primitive": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "x?=B@3d0Z.3|OR0`g~sM",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "python_isinstance",
                  "id": "Q(c7%bzo)}I3:pg=2+N1",
                  "inputs": {
                    "VALUE": {
                      "block": {
                        "type": "math_number",
                        "id": "kt~{=].u]C=qh:HR-7gg",
                        "fields": {
                          "NUM": 5
                        }
                      }
                    },
                    "TYPE": {
                      "block": {
                        "type": "python_type_primitive",
                        "id": "8c.7)??uQK1%vyvCTyw;",
                        "fields": {
                          "TYPE": "int"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print(isinstance(5, int))",
    "goal": "Check whether the number 5 is an integer.",
    "role": "The Primitive Type block supplies the 'int' type to compare against.",
    "interaction": "It's plugged into the Is Instance Of Type block's second socket, telling it which type to test for."
  },
  "python_isinstance": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "~0}0xgyd0?}kfo)*jeSD",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "[kU:kor#sZ=xxd$(Jk9d"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "x/oO_MFZ`7-#;_^4#Dg!",
                  "fields": {
                    "TEXT": "hello"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "a?;0%@]D*lL[]HmhIp7@",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "python_isinstance",
                      "id": "q:mqT1;[5gCy_R2~uDwC",
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "variables_get",
                            "id": "Zl,5/3Q/Pff`FTP7FAhK",
                            "fields": {
                              "VAR": {
                                "id": "[kU:kor#sZ=xxd$(Jk9d"
                              }
                            }
                          }
                        },
                        "TYPE": {
                          "block": {
                            "type": "python_type_primitive",
                            "id": "ZMYZMI6(*T*MjTHLX7qX",
                            "fields": {
                              "TYPE": "str"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "value",
          "id": "[kU:kor#sZ=xxd$(Jk9d"
        },
        {
          "name": "item",
          "id": "]Z_-,5]52j0,I=`QK=ap"
        }
      ]
    },
    "pythonPreview": "value = None\n\n\nvalue = 'hello'\nprint(isinstance(value, str))",
    "goal": "Check whether a piece of text is really a string.",
    "role": "The Is Instance Of Type block does the actual checking.",
    "interaction": "It takes the value variable and a Primitive Type block (str) as its two inputs, and prints the True/False result."
  },
  "type_cast_advanced": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "25inL*1Osf8;tBUNc(,W",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "OWL*kM.3{0yzULs=5n!N"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "f)Gp`w9,%Z`]!Rtx!{L.",
                  "fields": {
                    "TEXT": "3.14"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "yt7XLPKgItPLy.l,q9os",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "type_cast_advanced",
                      "id": "o9Z.[Mf,BXJqoDRmnMjk",
                      "fields": {
                        "TYPE": "float"
                      },
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "variables_get",
                            "id": "F)wXtA5aje*1_O^U._4+",
                            "fields": {
                              "VAR": {
                                "id": "OWL*kM.3{0yzULs=5n!N"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "raw",
          "id": "OWL*kM.3{0yzULs=5n!N"
        },
        {
          "name": "item",
          "id": "0K[hKQ#cnTFw-_H!~=0!"
        }
      ]
    },
    "pythonPreview": "raw = None\n\n\nraw = '3.14'\nprint(float(raw))",
    "goal": "Convert a piece of text ('3.14') into a real decimal number.",
    "role": "The Convert To Type block performs the conversion.",
    "interaction": "It takes the raw text variable and the chosen target type (float) and outputs the converted value to Print."
  },
  "procedure_return_value": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "procedures_defnoreturn",
            "id": "1ledOo5_6mLyU@w1mDl9",
            "x": 0,
            "y": 0,
            "fields": {
              "NAME": "check_age"
            },
            "inputs": {
              "STACK": {
                "block": {
                  "type": "variables_set",
                  "id": "fxNy$r!9W1tVzV!p+W-J",
                  "fields": {
                    "VAR": {
                      "id": "?m$-}`ENYIc^_HuUrc87"
                    }
                  },
                  "inputs": {
                    "VALUE": {
                      "block": {
                        "type": "math_number",
                        "id": "h`RB@Ny+N?`Sq4K7HO:,",
                        "fields": {
                          "NUM": 15
                        }
                      }
                    }
                  },
                  "next": {
                    "block": {
                      "type": "controls_if",
                      "id": "Y`FDeIb~YgoY?a0MGSm-",
                      "inputs": {
                        "IF0": {
                          "block": {
                            "type": "logic_compare",
                            "id": "jKVu|kOi:)~d]D^_Z^;f",
                            "fields": {
                              "OP": "LT"
                            },
                            "inputs": {
                              "A": {
                                "block": {
                                  "type": "variables_get",
                                  "id": "+YQ4rIM(n]oAOwt9}_3F",
                                  "fields": {
                                    "VAR": {
                                      "id": "?m$-}`ENYIc^_HuUrc87"
                                    }
                                  }
                                }
                              },
                              "B": {
                                "block": {
                                  "type": "math_number",
                                  "id": "GZZYn4%Gvr=(q~kSd4/s",
                                  "fields": {
                                    "NUM": 18
                                  }
                                }
                              }
                            }
                          }
                        },
                        "DO0": {
                          "block": {
                            "type": "text_print",
                            "id": "T0LvC{rFH4aA*[/v9Ry#",
                            "inputs": {
                              "TEXT": {
                                "block": {
                                  "type": "text",
                                  "id": "R/|9K320g9pi//xF`gQ:",
                                  "fields": {
                                    "TEXT": "Minor - exiting early"
                                  }
                                }
                              }
                            },
                            "next": {
                              "block": {
                                "type": "procedure_return_value",
                                "id": "MJ+WN%%1%lb%eMR.x,Hv",
                                "inputs": {
                                  "VALUE": {
                                    "block": {
                                      "type": "logic_null",
                                      "id": "q8C?@T53LKLi$m:ssLqK"
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      },
                      "next": {
                        "block": {
                          "type": "text_print",
                          "id": "*e6Re5h!P`8kg(o}Ujn-",
                          "inputs": {
                            "TEXT": {
                              "block": {
                                "type": "text",
                                "id": "qWx=YRe%a(C9-GCjor#_",
                                "fields": {
                                  "TEXT": "This line never runs for a minor"
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          {
            "type": "procedures_callnoreturn",
            "id": "4U%2xF.U^KDc}W1RKU??",
            "x": 0,
            "y": 0,
            "extraState": {
              "name": "check_age"
            }
          }
        ]
      },
      "variables": [
        {
          "name": "age",
          "id": "?m$-}`ENYIc^_HuUrc87"
        },
        {
          "name": "item",
          "id": "XXrdPZs!nBE-^[e8i_G)"
        }
      ]
    },
    "pythonPreview": "age = None\n\n\ndef check_age():\n  age = 15\n\n  if age < 18:\n    print('Minor - exiting early')\n\n    return None\n  print('This line never runs for a minor')\n\n\ncheck_age()",
    "goal": "Exit a function early when someone is under 18.",
    "role": "The Return block is what actually stops the function and hands control back to the caller.",
    "interaction": "It sits inside the If block's body, so it only runs when the age check is true \u2014 everything after it in the function is skipped."
  },
  "controls_repeat_ext": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "controls_repeat_ext",
            "id": "jUUijoWvTwle8yJVh::6",
            "x": 0,
            "y": 0,
            "inputs": {
              "TIMES": {
                "block": {
                  "type": "math_number",
                  "id": "A37/}Zj*Qd+cu=W/,r!n",
                  "fields": {
                    "NUM": 3
                  }
                }
              },
              "DO": {
                "block": {
                  "type": "text_print",
                  "id": "H8,#Bi3iNw0(hF)pv7E_",
                  "inputs": {
                    "TEXT": {
                      "block": {
                        "type": "text",
                        "id": "R_N$+Zt$A|4]oY+L?@g/",
                        "fields": {
                          "TEXT": "Hello!"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "for _ in range(3):\n  print('Hello!')",
    "goal": "Print a greeting exactly 3 times.",
    "role": "The Repeat block controls how many times the Print block underneath it runs.",
    "interaction": "It takes the number 3 as its repeat count and re-runs everything nested inside it that many times."
  },
  "controls_whileUntil": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "ZrdaDfO#`V?y0^2xf,2a",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "ZGRTaoNC9_PXDC=6NgJ]"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "EYe,m^b|.^u[KJjT.Px^",
                  "fields": {
                    "NUM": 0
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "controls_whileUntil",
                "id": "?%m[d!OR,@`=Xt)J)C=Z",
                "fields": {
                  "MODE": "WHILE"
                },
                "inputs": {
                  "BOOL": {
                    "block": {
                      "type": "logic_compare",
                      "id": "j6EPF!;yB.krFl(ING{6",
                      "fields": {
                        "OP": "LT"
                      },
                      "inputs": {
                        "A": {
                          "block": {
                            "type": "variables_get",
                            "id": "@5.^uep7$OwhzJ_4.e{D",
                            "fields": {
                              "VAR": {
                                "id": "ZGRTaoNC9_PXDC=6NgJ]"
                              }
                            }
                          }
                        },
                        "B": {
                          "block": {
                            "type": "math_number",
                            "id": "uMxMviB_Z0*U]2y73NP;",
                            "fields": {
                              "NUM": 3
                            }
                          }
                        }
                      }
                    }
                  },
                  "DO": {
                    "block": {
                      "type": "text_print",
                      "id": "AL[l=iR_GA[~4|UCV{-[",
                      "inputs": {
                        "TEXT": {
                          "block": {
                            "type": "variables_get",
                            "id": ",f5X|,JOZ.GN%oydl^LM",
                            "fields": {
                              "VAR": {
                                "id": "ZGRTaoNC9_PXDC=6NgJ]"
                              }
                            }
                          }
                        }
                      },
                      "next": {
                        "block": {
                          "type": "math_assignment",
                          "id": "u+Bxf|TM}ebq_`L^Gzs}",
                          "fields": {
                            "VAR": {
                              "id": "ZGRTaoNC9_PXDC=6NgJ]"
                            },
                            "OP": "ADD"
                          },
                          "inputs": {
                            "DELTA": {
                              "block": {
                                "type": "math_number",
                                "id": "-t(r{%*,1=DjF44[n_l}",
                                "fields": {
                                  "NUM": 1
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "count",
          "id": "ZGRTaoNC9_PXDC=6NgJ]"
        },
        {
          "name": "item",
          "id": "$eJWTyrNMQZq-*eF#;Ol"
        }
      ]
    },
    "pythonPreview": "count = None\n\n\ncount = 0\n\nwhile count < 3:\n  print(count)\n  count += 1",
    "goal": "Count up from 0 while it's still less than 3.",
    "role": "The Repeat While block keeps looping as long as its condition stays true.",
    "interaction": "It checks the Compare block (count < 3) before every pass, and the Compound Assignment block inside it is what eventually makes the condition false."
  },
  "controls_for": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "controls_for",
            "id": "d@)$I7k`:909(%eq;CYo",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "Q~w8ihrlK|4-,wP-G)]`"
              }
            },
            "inputs": {
              "FROM": {
                "block": {
                  "type": "math_number",
                  "id": "=VEnZ!6cT@+,#]e(pD*.",
                  "fields": {
                    "NUM": 1
                  }
                }
              },
              "TO": {
                "block": {
                  "type": "math_number",
                  "id": "s@-`l5:i0AM{}Ke)|DP8",
                  "fields": {
                    "NUM": 6
                  }
                }
              },
              "BY": {
                "block": {
                  "type": "math_number",
                  "id": "[)J?9+1gZ66uGFmf^;{`",
                  "fields": {
                    "NUM": 1
                  }
                }
              },
              "DO": {
                "block": {
                  "type": "text_print",
                  "id": "B8FfSr:kw*S^Z|KYva80",
                  "inputs": {
                    "TEXT": {
                      "block": {
                        "type": "variables_get",
                        "id": "8nuMl`h]b9@Z%bSJUkni",
                        "fields": {
                          "VAR": {
                            "id": "Q~w8ihrlK|4-,wP-G)]`"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "i",
          "id": "Q~w8ihrlK|4-,wP-G)]`"
        },
        {
          "name": "j",
          "id": "g660z`0tphxBi0MO4ICI"
        },
        {
          "name": "item",
          "id": "9tgFHca:xp(PPcLKDRJ`"
        }
      ]
    },
    "pythonPreview": "i = None\n\nfor i in range(1, 6):\n  print(i)",
    "goal": "Print the numbers 1 through 5.",
    "role": "The Count With block manages the loop variable i, automatically stepping it from 1 to 5.",
    "interaction": "It creates and updates the variable i itself, and the Print block inside simply reads whatever value i currently holds."
  },
  "controls_for_nested": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "controls_for",
            "id": "nlOuterFor001",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "nlVarI"
              }
            },
            "inputs": {
              "FROM": {
                "block": {
                  "type": "math_number",
                  "id": "nlFromI",
                  "fields": {
                    "NUM": 0
                  }
                }
              },
              "TO": {
                "block": {
                  "type": "math_number",
                  "id": "nlToI",
                  "fields": {
                    "NUM": 3
                  }
                }
              },
              "BY": {
                "block": {
                  "type": "math_number",
                  "id": "nlByI",
                  "fields": {
                    "NUM": 1
                  }
                }
              },
              "DO": {
                "block": {
                  "type": "controls_for",
                  "id": "nlInnerFor001",
                  "fields": {
                    "VAR": {
                      "id": "nlVarJ"
                    }
                  },
                  "inputs": {
                    "FROM": {
                      "block": {
                        "type": "math_number",
                        "id": "nlFromJ",
                        "fields": {
                          "NUM": 0
                        }
                      }
                    },
                    "TO": {
                      "block": {
                        "type": "math_number",
                        "id": "nlToJ",
                        "fields": {
                          "NUM": 3
                        }
                      }
                    },
                    "BY": {
                      "block": {
                        "type": "math_number",
                        "id": "nlByJ",
                        "fields": {
                          "NUM": 1
                        }
                      }
                    },
                    "DO": {
                      "block": {
                        "type": "text_print",
                        "id": "nlPrint001",
                        "inputs": {
                          "TEXT": {
                            "block": {
                              "type": "text_join",
                              "id": "nlJoin001",
                              "extraState": {
                                "itemCount": 5
                              },
                              "inputs": {
                                "ADD0": {
                                  "block": {
                                    "type": "text",
                                    "id": "nlT0",
                                    "fields": {
                                      "TEXT": "pair ("
                                    }
                                  }
                                },
                                "ADD1": {
                                  "block": {
                                    "type": "variables_get",
                                    "id": "nlGetI",
                                    "fields": {
                                      "VAR": {
                                        "id": "nlVarI"
                                      }
                                    }
                                  }
                                },
                                "ADD2": {
                                  "block": {
                                    "type": "text",
                                    "id": "nlT1",
                                    "fields": {
                                      "TEXT": ", "
                                    }
                                  }
                                },
                                "ADD3": {
                                  "block": {
                                    "type": "variables_get",
                                    "id": "nlGetJ",
                                    "fields": {
                                      "VAR": {
                                        "id": "nlVarJ"
                                      }
                                    }
                                  }
                                },
                                "ADD4": {
                                  "block": {
                                    "type": "text",
                                    "id": "nlT2",
                                    "fields": {
                                      "TEXT": ")"
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "i",
          "id": "nlVarI"
        },
        {
          "name": "j",
          "id": "nlVarJ"
        }
      ]
    },
    "pythonPreview": "i = None\nj = None\n\nfor i in range(3):\n    for j in range(3):\n        print(f\"pair ({i}, {j})\")",
    "goal": "See why a loop nested inside another loop costs n × n, not n — print every (i, j) pair from two small ranges.",
    "role": "The outer Count With block (i) restarts the ENTIRE inner loop from scratch on every single one of its passes.",
    "interaction": "For each of the outer loop's 3 passes, the inner Count With block (j) runs all 3 of its own passes — 3 × 3 = 9 total prints. Add one more item to either range and the total jumps to 16, not 4: that squared growth is what makes this O(n²)."
  },
  "controls_forEach": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": ")e[Pg.@BaZG2_E~$,LrP",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "=gL~pYe(f%,kL{L87c|`"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "kYrOnfg:P3q:XWghy:,V",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "VN1#:S_CS4JA-6Agu7{d",
                        "fields": {
                          "TEXT": "red"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "lm6kVxEFIh?(Ere6VUV#",
                        "fields": {
                          "TEXT": "green"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "B#7YgVQ1SEK@+RiF.6qr",
                        "fields": {
                          "TEXT": "blue"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "controls_forEach",
                "id": "mE58sSX35e=r%dnY%Xrt",
                "fields": {
                  "VAR": {
                    "id": "Cbf;+FLp:j!X36G1i7l0"
                  }
                },
                "inputs": {
                  "LIST": {
                    "block": {
                      "type": "variables_get",
                      "id": "$umX;-%M%jk:H|}wgVpL",
                      "fields": {
                        "VAR": {
                          "id": "=gL~pYe(f%,kL{L87c|`"
                        }
                      }
                    }
                  },
                  "DO": {
                    "block": {
                      "type": "text_print",
                      "id": "BgRL8wDW4scNU#j3|$[%",
                      "inputs": {
                        "TEXT": {
                          "block": {
                            "type": "variables_get",
                            "id": "br!LSDP!T6@U1[0dVf3C",
                            "fields": {
                              "VAR": {
                                "id": "Cbf;+FLp:j!X36G1i7l0"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "colors",
          "id": "=gL~pYe(f%,kL{L87c|`"
        },
        {
          "name": "color",
          "id": "Cbf;+FLp:j!X36G1i7l0"
        },
        {
          "name": "item",
          "id": "cFU~,V!iSC0DT*cvZ$`u"
        },
        {
          "name": "i",
          "id": "biQ(Y!dX3AA(a[#++@-?"
        }
      ]
    },
    "pythonPreview": "colors = None\ncolor = None\n\n\ncolors = ['red', 'green', 'blue']\n\nfor color in colors:\n  print(color)",
    "goal": "Print every color in a list of colors.",
    "role": "The For Each block hands you one list item at a time without needing an index.",
    "interaction": "It pulls each item out of the colors list in turn, stores it in the color variable, and runs Print once per item."
  },
  "controls_flow_statements": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "controls_for",
            "id": "d?%U)j{RzdQj/w)6RRQ2",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "a30d0zj*/0VxX]s#B]g*"
              }
            },
            "inputs": {
              "FROM": {
                "block": {
                  "type": "math_number",
                  "id": "BTH=ohTKMgX8*e*v+y6g",
                  "fields": {
                    "NUM": 1
                  }
                }
              },
              "TO": {
                "block": {
                  "type": "math_number",
                  "id": "*@azT3~DTUFqEcuAqDZb",
                  "fields": {
                    "NUM": 10
                  }
                }
              },
              "BY": {
                "block": {
                  "type": "math_number",
                  "id": "anDyH3:_m}m+~~bnu(CR",
                  "fields": {
                    "NUM": 1
                  }
                }
              },
              "DO": {
                "block": {
                  "type": "controls_if",
                  "id": "BG0edG*-Q%O9MYB~kiK_",
                  "inputs": {
                    "IF0": {
                      "block": {
                        "type": "logic_compare",
                        "id": "s+e)`GZ%9c)u$Bixh)c/",
                        "fields": {
                          "OP": "EQ"
                        },
                        "inputs": {
                          "A": {
                            "block": {
                              "type": "variables_get",
                              "id": "e|#f4^NT^Zm|W)N/_3C)",
                              "fields": {
                                "VAR": {
                                  "id": "a30d0zj*/0VxX]s#B]g*"
                                }
                              }
                            }
                          },
                          "B": {
                            "block": {
                              "type": "math_number",
                              "id": "3W/O2jHR).+!^$zwL$]J",
                              "fields": {
                                "NUM": 4
                              }
                            }
                          }
                        }
                      }
                    },
                    "DO0": {
                      "block": {
                        "type": "controls_flow_statements",
                        "id": "$2Atw9N}pzlh0V5(RTe}",
                        "fields": {
                          "FLOW": "BREAK"
                        }
                      }
                    }
                  },
                  "next": {
                    "block": {
                      "type": "text_print",
                      "id": "x/6me=27mt/I2O0.u]qn",
                      "inputs": {
                        "TEXT": {
                          "block": {
                            "type": "variables_get",
                            "id": "a+*DZz`T?60)4fj|5Y#3",
                            "fields": {
                              "VAR": {
                                "id": "a30d0zj*/0VxX]s#B]g*"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "i",
          "id": "a30d0zj*/0VxX]s#B]g*"
        },
        {
          "name": "j",
          "id": "f`?;8|JU$a!_bKY|JH-u"
        },
        {
          "name": "item",
          "id": "1,D8SNi*?Q[[M^;d9VD7"
        }
      ]
    },
    "pythonPreview": "i = None\n\nfor i in range(1, 10):\n  if i == 4:\n    break\n  print(i)",
    "goal": "Stop a loop early as soon as a specific number is reached.",
    "role": "The Break block is what jumps out of the loop the moment its condition is met.",
    "interaction": "It sits inside an If block nested inside the For loop, so it only fires once i equals 4, ending the loop immediately."
  },
  "controls_pass": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "nJvL%{8*;7u=c]MXp]0R",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "|m3a:`9EI,)3ZE:m*}L]"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "zZ5PChOXCh-EFdeT-|,C",
                  "fields": {
                    "NUM": 0
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "controls_if",
                "id": "fBAr:Uxac}PjH!sv`m+@",
                "inputs": {
                  "IF0": {
                    "block": {
                      "type": "logic_compare",
                      "id": "Qeny5ht:i`HZaZ@+!Q4%",
                      "fields": {
                        "OP": "EQ"
                      },
                      "inputs": {
                        "A": {
                          "block": {
                            "type": "variables_get",
                            "id": ".@h{3%7pqivpWK9)=p*.",
                            "fields": {
                              "VAR": {
                                "id": "|m3a:`9EI,)3ZE:m*}L]"
                              }
                            }
                          }
                        },
                        "B": {
                          "block": {
                            "type": "math_number",
                            "id": "-EjKLM%=.{/zmB+Q1t~H",
                            "fields": {
                              "NUM": 0
                            }
                          }
                        }
                      }
                    }
                  },
                  "DO0": {
                    "block": {
                      "type": "controls_pass",
                      "id": "JMkb=K.}+,4l?lWbi2Ik"
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "YhLZ:b6I_%o3mEOja^L1",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "text",
                          "id": "H:25Fw@]V-o8p9f7JeYR",
                          "fields": {
                            "TEXT": "Checked the to-do list (nothing to do yet)"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "todo_count",
          "id": "|m3a:`9EI,)3ZE:m*}L]"
        },
        {
          "name": "item",
          "id": "a7R1CHFQX9J-EZ`imU3+"
        }
      ]
    },
    "pythonPreview": "todo_count = None\n\n\ntodo_count = 0\n\nif todo_count == 0:\n  pass\nprint('Checked the to-do list (nothing to do yet)')",
    "goal": "Sketch out a check for an empty to-do list without deciding what to do about it yet.",
    "role": "The Pass block is a placeholder \u2014 it lets the If block have a body without doing anything yet.",
    "interaction": "It sits inside the If block's body purely so the block isn't left empty; the real logic can be added later."
  },
  "math_number": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "NqpQ].xzjYp=fLm9V$][",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "math_number",
                  "id": "VeVoqld7pk((+rj=IGL`",
                  "fields": {
                    "NUM": 42
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print(42)",
    "goal": "Show a plain, fixed number.",
    "role": "The Number block is simply supplying a literal value.",
    "interaction": "Its value flows directly into the Print block with no other blocks involved."
  },
  "math_arithmetic": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "qQEb5`l,!{9X79LYs.}N",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "y`R*C_JYcR](Kq*hOmqa"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "yda8W-^NYo;]?Pp4=ce,",
                  "fields": {
                    "NUM": 19.99
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "variables_set",
                "id": ")i1Vm{i`jI^Cgf,,S9@e",
                "fields": {
                  "VAR": {
                    "id": "Fnl#BA5o?PkZRTRG/1d{"
                  }
                },
                "inputs": {
                  "VALUE": {
                    "block": {
                      "type": "math_number",
                      "id": "t,H%H`ZF}`M~%h{7L4IO",
                      "fields": {
                        "NUM": 3
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "DycI8+11V0w2D6Iv.$S{",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "math_arithmetic",
                          "id": "nIu`2XVO%l^Wn#!#vMum",
                          "fields": {
                            "OP": "MULTIPLY"
                          },
                          "inputs": {
                            "A": {
                              "block": {
                                "type": "variables_get",
                                "id": "DqJ}1;s=Zii[.#Dw?xke",
                                "fields": {
                                  "VAR": {
                                    "id": "y`R*C_JYcR](Kq*hOmqa"
                                  }
                                }
                              }
                            },
                            "B": {
                              "block": {
                                "type": "variables_get",
                                "id": "y,/Zo~p$qrPz,YS~^%Mg",
                                "fields": {
                                  "VAR": {
                                    "id": "Fnl#BA5o?PkZRTRG/1d{"
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "price",
          "id": "y`R*C_JYcR](Kq*hOmqa"
        },
        {
          "name": "quantity",
          "id": "Fnl#BA5o?PkZRTRG/1d{"
        },
        {
          "name": "item",
          "id": "8,fs-z5_D)]UA]f$PlR`"
        }
      ]
    },
    "pythonPreview": "price = None\nquantity = None\n\n\nprice = 19.99\nquantity = 3\nprint(price * quantity)",
    "goal": "Calculate the total cost of 3 items at $19.99 each.",
    "role": "The Arithmetic block performs the multiplication.",
    "interaction": "It takes the price and quantity variables as its A and B inputs and sends the result straight to Print."
  },
  "math_advanced_operators": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "fWO-qhx(XW5cnh19^38~",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "math_advanced_operators",
                  "id": "ZOtN}ZYVOK09WzVa[5dU",
                  "fields": {
                    "OP": "POWER"
                  },
                  "inputs": {
                    "A": {
                      "block": {
                        "type": "math_number",
                        "id": "D(PT+/f-p-4[^ePnohH=",
                        "fields": {
                          "NUM": 2
                        }
                      }
                    },
                    "B": {
                      "block": {
                        "type": "math_number",
                        "id": "%k|J[Y1O;|,#cE1l9MOq",
                        "fields": {
                          "NUM": 10
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print(2 ** 10)",
    "goal": "Calculate 2 raised to the 10th power.",
    "role": "The Advanced Math block performs the exponent calculation.",
    "interaction": "It takes 2 and 10 as its A and B inputs with the Power operator selected, and prints the result."
  },
  "math_assignment": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "B)8*?wl;n5Yu#IjcnQw.",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "Tk!Z`dFf=8xFmiHAIq,j"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "_7[G0rAG;p]Od?4[.Jof",
                  "fields": {
                    "NUM": 0
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "math_assignment",
                "id": "Uh([#tUYco.WCDIMG_nw",
                "fields": {
                  "VAR": {
                    "id": "Tk!Z`dFf=8xFmiHAIq,j"
                  },
                  "OP": "ADD"
                },
                "inputs": {
                  "DELTA": {
                    "block": {
                      "type": "math_number",
                      "id": "(7~[Y287/rBc(kM*yZzH",
                      "fields": {
                        "NUM": 10
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "[GA%lK!K+cak~DPXQDi$",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "qUkMq;%g)g.]GvE:@9_B",
                          "fields": {
                            "VAR": {
                              "id": "Tk!Z`dFf=8xFmiHAIq,j"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "score",
          "id": "Tk!Z`dFf=8xFmiHAIq,j"
        },
        {
          "name": "item",
          "id": "R18hsfkt6=78T~.VCJgd"
        }
      ]
    },
    "pythonPreview": "score = None\n\n\nscore = 0\nscore += 10\nprint(score)",
    "goal": "Add 10 points to a running score.",
    "role": "The Compound Assignment block updates the score variable in place.",
    "interaction": "It reads the current value of score, adds the Delta input (10), and writes the new total back into the same variable."
  },
  "type_cast_int": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "cHt98YkS7?Bd;eq~O`hc",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "OpjfjQg(w(RiKar~,(8H"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "R{*()vRbbH(p,^VVllIi",
                  "fields": {
                    "TEXT": "42"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "2jfn+iH=c~e^J]r}CJeM",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "type_cast_int",
                      "id": "T:}ab?}f$v)3w,yT/eDQ",
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "variables_get",
                            "id": ")-jz7u:ynxZp0?QVaf8y",
                            "fields": {
                              "VAR": {
                                "id": "OpjfjQg(w(RiKar~,(8H"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "raw",
          "id": "OpjfjQg(w(RiKar~,(8H"
        },
        {
          "name": "item",
          "id": ".pP]pS0.HL[vF*DX/+J%"
        }
      ]
    },
    "pythonPreview": "raw = None\n\n\nraw = '42'\nprint(int(raw))",
    "goal": "Turn the text '42' into a real number.",
    "role": "The Convert To Integer block performs the conversion.",
    "interaction": "It takes the raw text variable as input and its numeric result is passed to Print."
  },
  "math_min_max": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "/0D=2Y+UXUa[bR6:=Ty+",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "math_min_max",
                  "id": "j#}6}iH#ue4hTKrg4s6!",
                  "fields": {
                    "OP": "MAX"
                  },
                  "inputs": {
                    "A": {
                      "block": {
                        "type": "math_number",
                        "id": "U+lI:qb)|z/a)mx4$j57",
                        "fields": {
                          "NUM": 15
                        }
                      }
                    },
                    "B": {
                      "block": {
                        "type": "math_number",
                        "id": "!Hcm*kWYl$]=H=GucPKZ",
                        "fields": {
                          "NUM": 23
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print(max(15, 23))",
    "goal": "Find the larger of two ages.",
    "role": "The Max/Min block does the comparison and picks a winner.",
    "interaction": "It takes 15 and 23 as its two inputs with 'max' selected, and outputs whichever is bigger to Print."
  },
  "math_abs_round": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "}*Szq^yS]?KTO4,)Xh|G",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "math_abs_round",
                  "id": "~p??/ATi^~h/zn7ljsrf",
                  "fields": {
                    "OP": "abs"
                  },
                  "inputs": {
                    "VALUE": {
                      "block": {
                        "type": "math_number",
                        "id": "Yx:gh,30pg%zUe88wV;3",
                        "fields": {
                          "NUM": -8
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print(abs(-8))",
    "goal": "Turn a negative temperature difference into a positive distance.",
    "role": "The Absolute Value/Round block strips the negative sign.",
    "interaction": "It takes -8 as its input and outputs 8, which Print then displays."
  },
  "math_single": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "?Jxol!OqS/b@t^/iF;Dn",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "math_single",
                  "id": "p%_?av!|o8Y-RYR*ubYi",
                  "fields": {
                    "OP": "ROOT"
                  },
                  "inputs": {
                    "NUM": {
                      "block": {
                        "type": "math_number",
                        "id": "t1LELu1JAmk/%jcZ]:_`",
                        "fields": {
                          "NUM": 81
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "import math\n\n\nprint(math.sqrt(81))",
    "goal": "Find the square root of 81.",
    "role": "The Single-Value Math block performs the square root calculation.",
    "interaction": "It takes 81 as its single input and passes the result (9) to Print."
  },
  "math_trig": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "Y1YdI1moGz^p0iNmj}Q@",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "math_trig",
                  "id": "8|mEF(p0rIwh|FkPo5#!",
                  "fields": {
                    "OP": "SIN"
                  },
                  "inputs": {
                    "NUM": {
                      "block": {
                        "type": "math_number",
                        "id": "@:N3#8[gfu,d`!9}7II*",
                        "fields": {
                          "NUM": 90
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "import math\n\n\nprint(math.sin(90 / 180.0 * math.pi))",
    "goal": "Calculate the sine of a 90-degree angle.",
    "role": "The Trigonometry block performs the sine calculation.",
    "interaction": "It takes 90 as its input angle and its result flows into Print."
  },
  "math_constant": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "F9y?t)Y_*9;s7C!M2!a,",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "$)e1[C~9m!|QEKrNl8Aa"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "WbdLXs04H{t5bR+F!k=}",
                  "fields": {
                    "NUM": 5
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "NoRol:-~qBGo!#+c{8zb",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "math_arithmetic",
                      "id": "K71vFzP%Et*_u}`TmL9T",
                      "fields": {
                        "OP": "MULTIPLY"
                      },
                      "inputs": {
                        "A": {
                          "block": {
                            "type": "math_arithmetic",
                            "id": "Dnu1pTWM8!0?Y;ZbLblA",
                            "fields": {
                              "OP": "MULTIPLY"
                            },
                            "inputs": {
                              "A": {
                                "block": {
                                  "type": "math_number",
                                  "id": "[k`{dimN+{mRf5o2Z/5{",
                                  "fields": {
                                    "NUM": 2
                                  }
                                }
                              },
                              "B": {
                                "block": {
                                  "type": "math_constant",
                                  "id": "LJ4r!/yKi7=n%sEt*F16",
                                  "fields": {
                                    "CONSTANT": "PI"
                                  }
                                }
                              }
                            }
                          }
                        },
                        "B": {
                          "block": {
                            "type": "variables_get",
                            "id": "BRXFgQu4b.}lDUifwW8E",
                            "fields": {
                              "VAR": {
                                "id": "$)e1[C~9m!|QEKrNl8Aa"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "radius",
          "id": "$)e1[C~9m!|QEKrNl8Aa"
        },
        {
          "name": "item",
          "id": ".EBSQeQg!qfUo6gmoM!+"
        }
      ]
    },
    "pythonPreview": "import math\n\nradius = None\n\n\nradius = 5\nprint((2 * math.pi) * radius)",
    "goal": "Calculate the circumference of a circle with radius 5.",
    "role": "The Math Constant block supplies the precise value of \u03c0 used in the formula.",
    "interaction": "It's multiplied by 2 and then by the radius variable, all inside nested Arithmetic blocks, before the final result is printed."
  },
  "math_number_property": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "=@@h/RicOyj|Yz;OF,yF",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "ZvyI/aYDoLGaLawtK(Ah"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "~Xa1n+9qKfW};b_!bp^x",
                  "fields": {
                    "NUM": 14
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "%.G/C?yi.aL:8d2.8AA$",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "math_number_property",
                      "id": "[r@m*[Ll`#)~SfNIOknP",
                      "extraState": "<mutation divisor_input=\"false\"></mutation>",
                      "fields": {
                        "PROPERTY": "EVEN"
                      },
                      "inputs": {
                        "NUMBER_TO_CHECK": {
                          "block": {
                            "type": "variables_get",
                            "id": "@Z5tjhm~(KvY/{^ogOo9",
                            "fields": {
                              "VAR": {
                                "id": "ZvyI/aYDoLGaLawtK(Ah"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "n",
          "id": "ZvyI/aYDoLGaLawtK(Ah"
        },
        {
          "name": "item",
          "id": "DDvo%{|Y!pF`yyt!kp]Y"
        }
      ]
    },
    "pythonPreview": "n = None\n\n\nn = 14\nprint(n % 2 == 0)",
    "goal": "Check whether the number 14 is even.",
    "role": "The Number Property block runs the even/odd test for you.",
    "interaction": "It takes the n variable as input and outputs True/False, which Print then displays."
  },
  "math_round": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "RgnL5jT;dbJPx+2MFiBA",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "math_round",
                  "id": "ib1EaGb#*z5Jg={kX/8d",
                  "fields": {
                    "OP": "ROUND"
                  },
                  "inputs": {
                    "NUM": {
                      "block": {
                        "type": "math_number",
                        "id": "tvakErVH#dY?2XZ}w5Mr",
                        "fields": {
                          "NUM": 7.6
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "import math\n\n\nprint(round(7.6))",
    "goal": "Round 7.6 to the nearest whole number.",
    "role": "The Round block performs the rounding.",
    "interaction": "It takes 7.6 as input and its rounded result (8) is passed to Print."
  },
  "math_on_list": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "hVnE|sT[*1ehW7L@buQ=",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "_oqtUGfpA$??8uSQN|e1"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": ",a:}$lIwlw%QKEPqS5?K",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "math_number",
                        "id": "d`g+M9ws@Cbvx%|m~5Q-",
                        "fields": {
                          "NUM": 88
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "math_number",
                        "id": "yd}_-LGG_;[qEjBPL=Pb",
                        "fields": {
                          "NUM": 92
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "math_number",
                        "id": "2.y@3YG5vZ[-gehzM!z3",
                        "fields": {
                          "NUM": 79
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "+/0oJHe#k5Fz=HTd!tl;",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "math_on_list",
                      "id": "5n`-pbh#6?:TeqvV:yIs",
                      "extraState": "<mutation op=\"AVERAGE\"></mutation>",
                      "fields": {
                        "OP": "AVERAGE"
                      },
                      "inputs": {
                        "LIST": {
                          "block": {
                            "type": "variables_get",
                            "id": "2`Iy:?brMBcVRz-.mz`I",
                            "fields": {
                              "VAR": {
                                "id": "_oqtUGfpA$??8uSQN|e1"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "grades",
          "id": "_oqtUGfpA$??8uSQN|e1"
        },
        {
          "name": "item",
          "id": "X{kb^5Rxmv)zsz1zIPOF"
        }
      ]
    },
    "pythonPreview": "from numbers import Number\n\ngrades = None\n\n\ndef math_mean(myList):\n  localList = [e for e in myList if isinstance(e, Number)]\n\n  if not localList: return\n\n  return float(sum(localList)) / len(localList)\n\n\ngrades = [88, 92, 79]\nprint(math_mean(grades))",
    "goal": "Find the average of three test grades.",
    "role": "The List Statistics block computes the average across the whole list at once.",
    "interaction": "It takes the grades list as its single input, with 'average' selected, and prints the computed result."
  },
  "math_modulo": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "rp89CFsmP5|;HI-(nu_k",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "sRv3dK$!MIU_R0z^OwR!"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "m}b@We|fe}f/}vdw9XGk",
                  "fields": {
                    "NUM": 17
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "342.zpM1RAa5+%sWMo==",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "math_modulo",
                      "id": "oUP5dhM+CCA[P?$lpmlL",
                      "inputs": {
                        "DIVIDEND": {
                          "block": {
                            "type": "variables_get",
                            "id": "~L/CTVGZubm}xm@M]?GM",
                            "fields": {
                              "VAR": {
                                "id": "sRv3dK$!MIU_R0z^OwR!"
                              }
                            }
                          }
                        },
                        "DIVISOR": {
                          "block": {
                            "type": "math_number",
                            "id": "wSoTjtl7Q[RrVQye:t@Q",
                            "fields": {
                              "NUM": 5
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "n",
          "id": "sRv3dK$!MIU_R0z^OwR!"
        },
        {
          "name": "item",
          "id": "xYe::3%Q9cP~^X~fRAC-"
        }
      ]
    },
    "pythonPreview": "n = None\n\n\nn = 17\nprint(n % 5)",
    "goal": "Find the remainder when 17 is divided by 5.",
    "role": "The Remainder Of block performs the modulo calculation.",
    "interaction": "It takes the n variable and 5 as its two inputs (dividend and divisor) and prints the leftover remainder."
  },
  "math_constrain": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "O^FWUaGsYoD:K52Add30",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "math_constrain",
                  "id": "%0r8cHY7#.]_t{Z}6Zcz",
                  "inputs": {
                    "VALUE": {
                      "block": {
                        "type": "math_number",
                        "id": "$Lk:CcTV$`$|1Ncm$}hV",
                        "fields": {
                          "NUM": 150
                        }
                      }
                    },
                    "LOW": {
                      "block": {
                        "type": "math_number",
                        "id": "d*2J^I}yo-bX1#FgdFNS",
                        "fields": {
                          "NUM": 0
                        }
                      }
                    },
                    "HIGH": {
                      "block": {
                        "type": "math_number",
                        "id": "xx6;LgklOLeS`]u[[`4+",
                        "fields": {
                          "NUM": 100
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print(min(max(150, 0), 100))",
    "goal": "Keep an out-of-range value (150) clamped between 0 and 100.",
    "role": "The Constrain block enforces the valid range.",
    "interaction": "It takes the value plus a low and high bound as its three inputs, and outputs the closest valid number (100) to Print."
  },
  "math_random_int": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "yK(ZtyVAkuhA9JL|@~$q",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "1=wUUG~i2jP6_7j6C[IC"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_random_int",
                  "id": "^f(7$L4YNC3kVCP/JD%n",
                  "inputs": {
                    "FROM": {
                      "block": {
                        "type": "math_number",
                        "id": "NH7=+k]MYDaT)t5C^umH",
                        "fields": {
                          "NUM": 1
                        }
                      }
                    },
                    "TO": {
                      "block": {
                        "type": "math_number",
                        "id": "V~$O!rtp6=U)SL2gk|LK",
                        "fields": {
                          "NUM": 6
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "U1oU)Saz4IHgO;8Wsl1j",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "custom_string_join",
                      "id": "^9Y_EK:Aqp1{O@,U*+~S",
                      "inputs": {
                        "LIST": {
                          "block": {
                            "type": "lists_create_with",
                            "id": "W.|!YFIHu33W)5b8LNuy",
                            "extraState": {
                              "itemCount": 2
                            },
                            "inputs": {
                              "ADD0": {
                                "block": {
                                  "type": "text",
                                  "id": "b2ItE?+;)o=q~66OGZJc",
                                  "fields": {
                                    "TEXT": "You rolled a"
                                  }
                                }
                              },
                              "ADD1": {
                                "block": {
                                  "type": "type_cast_advanced",
                                  "id": "DCE!qrrP-Xi0,K(=?-Ll",
                                  "fields": {
                                    "TYPE": "str"
                                  },
                                  "inputs": {
                                    "VALUE": {
                                      "block": {
                                        "type": "variables_get",
                                        "id": "volLD+^c{K-RkLR|Enaw",
                                        "fields": {
                                          "VAR": {
                                            "id": "1=wUUG~i2jP6_7j6C[IC"
                                          }
                                        }
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        },
                        "DELIMITER": {
                          "block": {
                            "type": "text",
                            "id": "=]H?Gns$5XADpu2;tWH|",
                            "fields": {
                              "TEXT": " "
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "roll",
          "id": "1=wUUG~i2jP6_7j6C[IC"
        },
        {
          "name": "item",
          "id": "u$#Z{ZSILpZ)du4g#K]n"
        }
      ]
    },
    "pythonPreview": "import random\n\nroll = None\n\n\nroll = random.randint(1, 6)\nprint(' '.join(['You rolled a', str(roll)]))",
    "goal": "Simulate rolling a six-sided die.",
    "role": "The Random Integer block generates the random roll.",
    "interaction": "It takes 1 and 6 as its bounds, and its random result is stored in roll before being joined into a printed sentence."
  },
  "math_random_float": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "t3?caV^JS65~PpnD,adf",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "math_random_float",
                  "id": "li*@|4N$CvE4z=^{hba1"
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "import random\n\n\nprint(random.random())",
    "goal": "Generate a random decimal between 0 and 1.",
    "role": "The Random Fraction block produces the random value.",
    "interaction": "It has no inputs at all \u2014 it just generates a fresh value each time and hands it straight to Print."
  },
  "comment_block": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "comment_block",
            "id": "wd)5n*BmMMFsIX!t7wGo",
            "x": 0,
            "y": 0,
            "fields": {
              "TEXT": "Below we calculate the total price"
            },
            "next": {
              "block": {
                "type": "variables_set",
                "id": "@c$Frf9MCO1w7@/7#,29",
                "fields": {
                  "VAR": {
                    "id": "~f+@!i!KERxKO6$t{chI"
                  }
                },
                "inputs": {
                  "VALUE": {
                    "block": {
                      "type": "math_arithmetic",
                      "id": "z:pdz1o#t~JA|ceD`QT2",
                      "fields": {
                        "OP": "MULTIPLY"
                      },
                      "inputs": {
                        "A": {
                          "block": {
                            "type": "math_number",
                            "id": ",fPF`.glVw8F8$uD`[L9",
                            "fields": {
                              "NUM": 4
                            }
                          }
                        },
                        "B": {
                          "block": {
                            "type": "math_number",
                            "id": "@]{=~;emy75-uXp|C:n.",
                            "fields": {
                              "NUM": 2.5
                            }
                          }
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "Z1-!xibhvYD7Hc]nA@[|",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "NDtHHO@1Wg{jXDn~floM",
                          "fields": {
                            "VAR": {
                              "id": "~f+@!i!KERxKO6$t{chI"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "total",
          "id": "~f+@!i!KERxKO6$t{chI"
        },
        {
          "name": "item",
          "id": "*bVdzTDFUAE2:pX!$;~("
        }
      ]
    },
    "pythonPreview": "total = None\n\n# Below we calculate the total price\ntotal = 4 * 2.5\nprint(total)",
    "goal": "Document a total-price calculation so it's easy to understand later.",
    "role": "The Comment block adds a human-readable note; it doesn't affect the program at all.",
    "interaction": "It sits above the calculation purely as documentation \u2014 Python ignores it completely when the code actually runs."
  },
  "multi_line_comment": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "multi_line_comment",
            "id": "?/HCwBgF?o|pK#/|KMwv",
            "x": 0,
            "y": 0,
            "fields": {
              "TEXT": "This program greets the user.\nIt is a simple starting example."
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "Zpt,f;Bk#P32S)Btr7AI",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "text",
                      "id": "D-Ahhyg8eR(*X%S6-?A/",
                      "fields": {
                        "TEXT": "Hello!"
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "\"\"\"\nThis program greets the user.\nIt is a simple starting example.\n\"\"\"\nprint('Hello!')",
    "goal": "Leave a longer, multi-line explanation at the top of a simple greeting program.",
    "role": "The Multi-Line Comment block documents the whole snippet in one note.",
    "interaction": "Like the single-line comment, it has no effect on execution \u2014 it's purely there for a human reader."
  },
  "text": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "yOYZX;{L1i}XDuaRD2V.",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "text",
                  "id": "9B]7UNz9kJ7V1;,!=myL",
                  "fields": {
                    "TEXT": "Hello, AlgoBlocks!"
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print('Hello, AlgoBlocks!')",
    "goal": "Display a simple fixed message.",
    "role": "The Text block is supplying the literal string.",
    "interaction": "Its value flows directly into Print with nothing else involved."
  },
  "text_newline": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "$|9=Mwy|ld`TG~^,tYxk",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "text_join",
                  "id": "cFx0])f:f^HM9I{%*@(G",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "?qyPlN|uR]zLiaOqWb^i",
                        "fields": {
                          "TEXT": "Line one"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text_newline",
                        "id": "ywJ8{t{dK:4#X4p7)EHF"
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "k_1.2Evr)0!VC_{7#)-Y",
                        "fields": {
                          "TEXT": "Line two"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print(f\"Line one\\nLine two\")",
    "goal": "Print two lines of text with a forced line break between them.",
    "role": "The Line Break block inserts the actual newline character.",
    "interaction": "It's joined between two Text blocks inside a Join Text block, forcing the second piece of text onto its own line."
  },
  "text_multiply": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "~!+}nBtTXxY0f/z=VN3w",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "text_multiply",
                  "id": ":NPz=9NlNM6+MafmScs+",
                  "inputs": {
                    "TEXT": {
                      "block": {
                        "type": "text",
                        "id": "jRcUC4`Akf$])QGNi8TW",
                        "fields": {
                          "TEXT": "Ha"
                        }
                      }
                    },
                    "MULTIPLIER": {
                      "block": {
                        "type": "math_number",
                        "id": "8xp:@aK:n@21,ZL0O{kP",
                        "fields": {
                          "NUM": 3
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print('Ha' * 3)",
    "goal": "Build a string of repeated laughter: 'Ha' three times.",
    "role": "The Repeat Text block does the repeating.",
    "interaction": "It takes the text 'Ha' and the number 3 as its two inputs, producing 'HaHaHa' for Print to display."
  },
  "custom_string_join": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "PV-FEBBtAai`eK/WFWqj",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "U#9d`VH6Dt]b8`KJ+d`)"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": ":J:a|_lrE8;+vS45Ze=r",
                  "extraState": {
                    "itemCount": 4
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "/HA^[4M{y7X0G#koQvQ+",
                        "fields": {
                          "TEXT": "AlgoBlocks"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "z-!(}Ot^pAp`)Uvj!u}^",
                        "fields": {
                          "TEXT": "makes"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "Lp/pPc-/|({0L*YSQmSh",
                        "fields": {
                          "TEXT": "learning"
                        }
                      }
                    },
                    "ADD3": {
                      "block": {
                        "type": "text",
                        "id": "RuQ=OAU|$siObghdXC@m",
                        "fields": {
                          "TEXT": "fun"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "I!6c):JRUAZ9w-tYFcIo",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "custom_string_join",
                      "id": "Od{v3IR{k,11QWUDd_lW",
                      "inputs": {
                        "LIST": {
                          "block": {
                            "type": "variables_get",
                            "id": "@=l1:4cHJt16x[8}=`qg",
                            "fields": {
                              "VAR": {
                                "id": "U#9d`VH6Dt]b8`KJ+d`)"
                              }
                            }
                          }
                        },
                        "DELIMITER": {
                          "block": {
                            "type": "text",
                            "id": "x(E}~%+2R{GlWUddZVE$",
                            "fields": {
                              "TEXT": " "
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "words",
          "id": "U#9d`VH6Dt]b8`KJ+d`)"
        },
        {
          "name": "item",
          "id": "9@59Z-w{$xK;JX,;Rk2`"
        }
      ]
    },
    "pythonPreview": "words = None\n\n\nwords = ['AlgoBlocks', 'makes', 'learning', 'fun']\nprint(' '.join(words))",
    "goal": "Turn a list of words into one readable sentence.",
    "role": "The Join List Into String block glues every item together with a chosen delimiter.",
    "interaction": "It takes the words list and a single space as its delimiter, producing one combined string for Print."
  },
  "string_split": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "(swcpu!E-aa24{pynQ}|",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "-jBLLKK,+Yb{E-9:EUw!"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "kT]L!-UZPnL5D9{F^;#2",
                  "fields": {
                    "TEXT": "red,green,blue"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "3v9H#CiCcSA.p7v/hiO-",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "string_split",
                      "id": "RW1^_6c2/aD7oQWX]A=Y",
                      "inputs": {
                        "STRING": {
                          "block": {
                            "type": "variables_get",
                            "id": "zBt[~$E|8h7:2#Azc5*$",
                            "fields": {
                              "VAR": {
                                "id": "-jBLLKK,+Yb{E-9:EUw!"
                              }
                            }
                          }
                        },
                        "DELIMITER": {
                          "block": {
                            "type": "text",
                            "id": "v#irYV%0bagY5^2pV7#q",
                            "fields": {
                              "TEXT": ","
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "csv",
          "id": "-jBLLKK,+Yb{E-9:EUw!"
        },
        {
          "name": "item",
          "id": "f}4{y)C;(mp`uoA%ZIGQ"
        }
      ]
    },
    "pythonPreview": "csv = None\n\n\ncsv = 'red,green,blue'\nprint(csv.split(','))",
    "goal": "Break a comma-separated list of colors back into individual items.",
    "role": "The Split String block does the splitting.",
    "interaction": "It takes the csv variable and the comma character as its delimiter, producing a list that Print then displays."
  },
  "string_case_formatting": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "R7,$H0|(chX8csh?Q^H}",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "string_case_formatting",
                  "id": "EoY,tV]vyFauGf9fEP*}",
                  "fields": {
                    "CASE": "title"
                  },
                  "inputs": {
                    "STRING": {
                      "block": {
                        "type": "text",
                        "id": "ZZ)^5Rx5[c2B^M(lOeLQ",
                        "fields": {
                          "TEXT": "welcome to algoblocks"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print('welcome to algoblocks'.title())",
    "goal": "Turn a lowercase sentence into Title Case for a heading.",
    "role": "The Format Text Case block performs the capitalization change.",
    "interaction": "It takes the raw sentence as input and, with Title Case selected, outputs the reformatted version to Print."
  },
  "text_join": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "xkD%J9~BdNj1+u!oxzs/",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "hx}bc!wP5:[]Ksk,u7EN"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "fK*jb,z^Fjfp]B,=M):p",
                  "fields": {
                    "TEXT": "Maria"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "Fgv(KbXa9FD4P^0$k1A7",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "text_join",
                      "id": "i9*8:$)7=;DAlwd|xK!1",
                      "extraState": {
                        "itemCount": 2
                      },
                      "inputs": {
                        "ADD0": {
                          "block": {
                            "type": "text",
                            "id": ";R5*8001GHbnG)_+uEvV",
                            "fields": {
                              "TEXT": "Hello, "
                            }
                          }
                        },
                        "ADD1": {
                          "block": {
                            "type": "variables_get",
                            "id": "EzD2R~6V!=GoIEZQpUhs",
                            "fields": {
                              "VAR": {
                                "id": "hx}bc!wP5:[]Ksk,u7EN"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "name",
          "id": "hx}bc!wP5:[]Ksk,u7EN"
        },
        {
          "name": "item",
          "id": "NJt}3Up9]:EzM~s$!z_:"
        }
      ]
    },
    "pythonPreview": "name = None\n\n\nname = 'Maria'\nprint(f\"Hello, {name}\")",
    "goal": "Build a personalized greeting from a name.",
    "role": "The Join Text block glues the fixed greeting and the name variable together.",
    "interaction": "It takes 'Hello, ' and the name variable as its two pieces and produces one combined string for Print."
  },
  "text_append": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": ",@N)VHy1lMX3,HKb/D]W",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": ":TValC]|.,]D^byK=7D6"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": ")ig_RJ.Smgy7._qUg2H,",
                  "fields": {
                    "TEXT": "Score: "
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_append",
                "id": "v@!pnHD}Zck-Ph[CZ~[%",
                "fields": {
                  "VAR": {
                    "id": ":TValC]|.,]D^byK=7D6"
                  }
                },
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "type_cast_advanced",
                      "id": "P)t@()39A}q4Eg%J$%kY",
                      "fields": {
                        "TYPE": "str"
                      },
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "math_number",
                            "id": ":Si2XTfYNo`4KOjJs[E;",
                            "fields": {
                              "NUM": 100
                            }
                          }
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "}GTsDMI4of,uyR!n#/X6",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "3o;y(DX%%eD8SjX1-l{{",
                          "fields": {
                            "VAR": {
                              "id": ":TValC]|.,]D^byK=7D6"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "message",
          "id": ":TValC]|.,]D^byK=7D6"
        },
        {
          "name": "item",
          "id": "uijuX2xO!1-Z%_d{)/l?"
        }
      ]
    },
    "pythonPreview": "message = None\n\n\nmessage = 'Score: '\nmessage = str(message) + str(str(100))\nprint(message)",
    "goal": "Build up a score message piece by piece.",
    "role": "The Append To Text block adds more text onto the end of an existing message.",
    "interaction": "It reads the current value of message and tacks the converted score number onto the end, updating the same variable."
  },
  "text_length": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "5FS=/O|Kb}qAMG+=_;u2",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "#e|`r}Iy]U:wU+`}H5Ss"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "@[0m?qGuHlzk?c)FYTz3",
                  "fields": {
                    "TEXT": "algoblocks_fan"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "W$ot}Jx[jn;8F(X]xnj1",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "text_length",
                      "id": "wEx8=%_bH0:P$.Kq$+S)",
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "variables_get",
                            "id": "br,dJK.h5.3M~f82|U*$",
                            "fields": {
                              "VAR": {
                                "id": "#e|`r}Iy]U:wU+`}H5Ss"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "username",
          "id": "#e|`r}Iy]U:wU+`}H5Ss"
        },
        {
          "name": "item",
          "id": "xD7Nw2wAT(5%0|(OaJFy"
        }
      ]
    },
    "pythonPreview": "username = None\n\n\nusername = 'algoblocks_fan'\nprint(len(username))",
    "goal": "Check how many characters are in a username.",
    "role": "The Length Of Text block counts the characters.",
    "interaction": "It takes the username variable as input and its numeric result is passed to Print."
  },
  "text_isEmpty": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "nyoU,?cR|,kA:-Y]fCSx",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "v[#f!ZOYAM[mqgN,t^o+"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "_Q-Bq[W.#p!ovQ+A+:5R",
                  "fields": {
                    "TEXT": ""
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "_Of2yeLx|M/iH.dD4g_P",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "text_isEmpty",
                      "id": "R%n0a66zWv/kz%gLLdGt",
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "variables_get",
                            "id": "$/R/4.}*!Zt-TU}T@hPL",
                            "fields": {
                              "VAR": {
                                "id": "v[#f!ZOYAM[mqgN,t^o+"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "note",
          "id": "v[#f!ZOYAM[mqgN,t^o+"
        },
        {
          "name": "item",
          "id": "6_r_a*Zis6KmDG;$R1}O"
        }
      ]
    },
    "pythonPreview": "note = None\n\n\nnote = ''\nprint(not len(note))",
    "goal": "Check whether a note field was left blank.",
    "role": "The Is Text Empty block performs the blank check.",
    "interaction": "It takes the note variable as input and outputs True/False, which Print then displays."
  },
  "text_indexOf": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "V[6+**{d`KX*(C7/)h-U",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "#.?+APt@/p,AwHqb%qyC"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "5;gq.DRuvN6sGV{#r3*0",
                  "fields": {
                    "TEXT": "student@algoblocks.com"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "L2h98pg%$?$Va{7j+Bj(",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "text_indexOf",
                      "id": "5X/N|GOHM,g@{6z}7B-e",
                      "fields": {
                        "END": "FIRST"
                      },
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "variables_get",
                            "id": "w|O.wdP2P[rm%Ky-6c;k",
                            "fields": {
                              "VAR": {
                                "id": "#.?+APt@/p,AwHqb%qyC"
                              }
                            }
                          }
                        },
                        "FIND": {
                          "block": {
                            "type": "text",
                            "id": "y;(`$6,[7FF~jSv#(OR@",
                            "fields": {
                              "TEXT": "@"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "email",
          "id": "#.?+APt@/p,AwHqb%qyC"
        },
        {
          "name": "item",
          "id": ":3M%,O8Y03oo]Xm5?M5Y"
        }
      ]
    },
    "pythonPreview": "email = None\n\n\nemail = 'student@algoblocks.com'\nprint(email.find('@') + 1)",
    "goal": "Find where the '@' symbol sits inside an email address.",
    "role": "The Find Text In Text block searches for the position.",
    "interaction": "It takes the email variable and the character '@' as its two inputs, and its found position is passed to Print."
  },
  "text_charAt": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "ffQ0AfBN.kY~w*Upfyaj",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "{NH]})$cIci*9/],R86f"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "B)79pCZQra8H.qpmm0WK",
                  "fields": {
                    "TEXT": "Alex"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "EDL6Uq2;TgW}EZK]U=/Z",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "text_charAt",
                      "id": "wRNd}Vyb]rifhgC[L)dB",
                      "extraState": "<mutation at=\"false\"></mutation>",
                      "fields": {
                        "WHERE": "FIRST"
                      },
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "variables_get",
                            "id": "u:ciyZJQt${|)IU9X2[~",
                            "fields": {
                              "VAR": {
                                "id": "{NH]})$cIci*9/],R86f"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "name",
          "id": "{NH]})$cIci*9/],R86f"
        },
        {
          "name": "item",
          "id": "60:`-QdVu,y#U+F5$h;y"
        }
      ]
    },
    "pythonPreview": "name = None\n\n\nname = 'Alex'\nprint(name[0])",
    "goal": "Get just the first letter of a name.",
    "role": "The Letter At Position block picks out a single character.",
    "interaction": "It takes the name variable as input, with 'first' selected, and passes that one letter to Print."
  },
  "text_getSubstring": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "u8f#ey#OoBy3a]iFj9mL",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": ":)%$8(b%7`9@Q/!fUAs-"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "pepk4m1EF$nBpa5),el.",
                  "fields": {
                    "TEXT": "report_final.pdf"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "#d,5},pIp9z3,^;I|}.W",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "text_getSubstring",
                      "id": "7t833Y.+#.RjRVkO,aWk",
                      "extraState": "<mutation at1=\"false\" at2=\"false\"></mutation>",
                      "fields": {
                        "WHERE1": "FIRST",
                        "WHERE2": "LAST"
                      },
                      "inputs": {
                        "STRING": {
                          "block": {
                            "type": "variables_get",
                            "id": ")7pVVJT2uT*~TnG7~ivh",
                            "fields": {
                              "VAR": {
                                "id": ":)%$8(b%7`9@Q/!fUAs-"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "filename",
          "id": ":)%$8(b%7`9@Q/!fUAs-"
        },
        {
          "name": "item",
          "id": "{Mfy8yRmHnd,RRo+PqTa"
        }
      ]
    },
    "pythonPreview": "filename = None\n\n\nfilename = 'report_final.pdf'\nprint(filename[ : ])",
    "goal": "Extract a whole filename, from its first to its last character.",
    "role": "The Substring block extracts the requested range of characters.",
    "interaction": "It takes the filename variable as input with First/Last selected as its start and end points, then prints the result."
  },
  "text_changeCase": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "9aqA;Q]e-e`{OA}!hvG{",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "text_changeCase",
                  "id": "XM?Y@MzUzEf@%*~p(=`_",
                  "fields": {
                    "CASE": "UPPERCASE"
                  },
                  "inputs": {
                    "TEXT": {
                      "block": {
                        "type": "text",
                        "id": ")`Iuueu@h2QUM],yvBX4",
                        "fields": {
                          "TEXT": "warning"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print('warning'.upper())",
    "goal": "Shout a warning message in uppercase.",
    "role": "The Change Text Case block performs the conversion.",
    "interaction": "It takes the word 'warning' as input and, with UPPERCASE selected, outputs 'WARNING' to Print."
  },
  "text_trim": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "Tz-DIe=89|41.rx1-n%R",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": ";f~If#E@8dc7i3~3)/C:"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "`9#WPm#M7TcYvPvyO7#W",
                  "fields": {
                    "TEXT": "   hello   "
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "}a|#0(7uB`LV3}]2yMzB",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "text_trim",
                      "id": "w}w/@DglifNVz;rTbK`%",
                      "fields": {
                        "MODE": "BOTH"
                      },
                      "inputs": {
                        "TEXT": {
                          "block": {
                            "type": "variables_get",
                            "id": "Kk6R8xY.+(r)RH6%oA_[",
                            "fields": {
                              "VAR": {
                                "id": ";f~If#E@8dc7i3~3)/C:"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "input_text",
          "id": ";f~If#E@8dc7i3~3)/C:"
        },
        {
          "name": "item",
          "id": "hT_e-hkzo~EZ^:AG7@Mp"
        }
      ]
    },
    "pythonPreview": "input_text = None\n\n\ninput_text = '   hello   '\nprint(input_text.strip())",
    "goal": "Clean up user input that has extra spaces around it.",
    "role": "The Trim Whitespace block removes the unwanted spaces.",
    "interaction": "It takes the input_text variable (with leading/trailing spaces) and outputs a cleaned version to Print."
  },
  "text_print": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "qOSW7AT3K9kwg{2~?#]D",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "text",
                  "id": "|Hvpv+*1SI!(J2zWzVuW",
                  "fields": {
                    "TEXT": "This is what the Print block does!"
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print('This is what the Print block does!')",
    "goal": "Show a message directly in the console.",
    "role": "The Print block is the star of this whole example \u2014 it's what actually displays output.",
    "interaction": "It takes any value as input (here, fixed text) and sends it to the console."
  },
  "python_input": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": ";O2:D#V25Y,m#7xBFWv8",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": ")JbQeILBY)%(V{y3RPok"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "python_input",
                  "id": "5r0J/qQUCQ8hh]F~0-@]",
                  "inputs": {
                    "PROMPT": {
                      "block": {
                        "type": "text",
                        "id": "LUR@Wem/$17)W=;PCJp0",
                        "fields": {
                          "TEXT": "What is your name? "
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "+_9T:4jDUpj/*000RXh~",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "text_join",
                      "id": "nD-6m)b@jmgib=$Y{5qI",
                      "extraState": {
                        "itemCount": 2
                      },
                      "inputs": {
                        "ADD0": {
                          "block": {
                            "type": "text",
                            "id": "9%$JdtqBlk+TZCIQ=%)Y",
                            "fields": {
                              "TEXT": "Nice to meet you, "
                            }
                          }
                        },
                        "ADD1": {
                          "block": {
                            "type": "variables_get",
                            "id": "[PhC@$?TG!Q-Q_r%KGGh",
                            "fields": {
                              "VAR": {
                                "id": ")JbQeILBY)%(V{y3RPok"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "name",
          "id": ")JbQeILBY)%(V{y3RPok"
        },
        {
          "name": "item",
          "id": "#%BZD1]+Aay%F?$p-`rM"
        }
      ]
    },
    "pythonPreview": "name = None\n\n\nname = input('What is your name? ')\nprint(f\"Nice to meet you, {name}\")",
    "goal": "Ask the user for their name and greet them back.",
    "role": "The Ask For Input block pauses the program and waits for the person to type something.",
    "interaction": "Its typed response is stored in the name variable, then joined into a personalized greeting that gets printed."
  },
  "string_to_list": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "!H7,f[5/}A}[TTX!*qB4",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "Hy+PeEUWX}o9?CrN.Jr*"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "r-eSx-.%bf%9pmRd~Q-=",
                  "fields": {
                    "TEXT": "cat"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "M;xM_~_Am8]%5yxoZ0aV",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "string_to_list",
                      "id": "?5I$$8k,@j-4Pi*2G.e0",
                      "inputs": {
                        "STRING": {
                          "block": {
                            "type": "variables_get",
                            "id": "q=e?85@,dXy$Dj0YZ5(}",
                            "fields": {
                              "VAR": {
                                "id": "Hy+PeEUWX}o9?CrN.Jr*"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "word",
          "id": "Hy+PeEUWX}o9?CrN.Jr*"
        },
        {
          "name": "item",
          "id": "JSd`@y3Ws/*Ve[`nGomC"
        }
      ]
    },
    "pythonPreview": "word = None\n\n\nword = 'cat'\nprint(list(word))",
    "goal": "Break the word 'cat' into individual letters.",
    "role": "The String To List block performs the conversion.",
    "interaction": "It takes the word variable as input and its resulting list of letters is passed to Print."
  },
  "lists_create_with": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "en3W}9qf9SYjrS:6NUS?",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "lists_create_with",
                  "id": "=qGc_%v8:q@sK=YK_Hyd",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "!{V`p+(C.P:|+2I=(Y~Y",
                        "fields": {
                          "TEXT": "pen"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "TTe_~@0:(.]Xiko9~rR!",
                        "fields": {
                          "TEXT": "pencil"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "BI]09~r3)/xsNxe`4U)*",
                        "fields": {
                          "TEXT": "eraser"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print(['pen', 'pencil', 'eraser'])",
    "goal": "Build a simple school-supplies list from scratch.",
    "role": "The Create List With block assembles the list out of three separate items.",
    "interaction": "It takes three Text blocks as its inputs and outputs one combined list, straight into Print."
  },
  "list_append": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "8b=jUFoH%yb7CxczJnl*",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "2O3g(`A#_H|,7Eqo011F"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "i0m{5oeWIE)PY%+w!sBB",
                  "extraState": {
                    "itemCount": 2
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "q;m`SP3J+Ea4TgTceWfn",
                        "fields": {
                          "TEXT": "milk"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "]Yr,($kqt=zuFA;LIpSO",
                        "fields": {
                          "TEXT": "bread"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "list_append",
                "id": "fDtMIJ!v1;Pi`;36kI-@",
                "inputs": {
                  "ITEM": {
                    "block": {
                      "type": "text",
                      "id": "FjR37]MYKWRyS8ntAF1v",
                      "fields": {
                        "TEXT": "eggs"
                      }
                    }
                  },
                  "LIST": {
                    "block": {
                      "type": "variables_get",
                      "id": ";TIxZ8USwxVwHiQp~~NG",
                      "fields": {
                        "VAR": {
                          "id": "2O3g(`A#_H|,7Eqo011F"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": ";B9@!b]DLND1oeD8b=zD",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "6bs=HIfmH~rp1iYm:Yui",
                          "fields": {
                            "VAR": {
                              "id": "2O3g(`A#_H|,7Eqo011F"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "cart",
          "id": "2O3g(`A#_H|,7Eqo011F"
        },
        {
          "name": "item",
          "id": "cb9/-UF^Yo{6Yd07NU1^"
        }
      ]
    },
    "pythonPreview": "cart = None\n\n\ncart = ['milk', 'bread']\ncart.append('eggs')\nprint(cart)",
    "goal": "Add 'eggs' to an existing shopping list.",
    "role": "The Append To List block grows the list by one item.",
    "interaction": "It takes the new item and the cart list as inputs, modifying cart directly rather than producing a new value."
  },
  "list_concat": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "=d#;0%0wKr%WEE8,YB6Q",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "BvpM=r6%hB68!}K%prMv"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "g`d6:A}dKBx26:/zq)KY",
                  "extraState": {
                    "itemCount": 2
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "F0Kl[wtWuDpykrI,r_Ga",
                        "fields": {
                          "TEXT": "Ana"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "!=z?^G)D`t;acy=+Bxj!",
                        "fields": {
                          "TEXT": "Ben"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "variables_set",
                "id": "hHld~(Nb=`(ya6X|;=?k",
                "fields": {
                  "VAR": {
                    "id": "-@L3gcDV4XBsI@{TKx!%"
                  }
                },
                "inputs": {
                  "VALUE": {
                    "block": {
                      "type": "lists_create_with",
                      "id": "-fXuMN8#SXthv:7,3o_K",
                      "extraState": {
                        "itemCount": 1
                      },
                      "inputs": {
                        "ADD0": {
                          "block": {
                            "type": "text",
                            "id": "|E`t~CCK[)^ZOp_mjFWT",
                            "fields": {
                              "TEXT": "Cleo"
                            }
                          }
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "Gzy)b3@,G,$6Ir?BTdlT",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "list_concat",
                          "id": "id@`(?D%BEhb1-E+drY|",
                          "inputs": {
                            "LIST1": {
                              "block": {
                                "type": "variables_get",
                                "id": "Tz4r(mTb0FJ=LKFD,O0w",
                                "fields": {
                                  "VAR": {
                                    "id": "BvpM=r6%hB68!}K%prMv"
                                  }
                                }
                              }
                            },
                            "LIST2": {
                              "block": {
                                "type": "variables_get",
                                "id": "t0,,Mdz%ha@(?z}WXB-*",
                                "fields": {
                                  "VAR": {
                                    "id": "-@L3gcDV4XBsI@{TKx!%"
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "teamA",
          "id": "BvpM=r6%hB68!}K%prMv"
        },
        {
          "name": "teamB",
          "id": "-@L3gcDV4XBsI@{TKx!%"
        },
        {
          "name": "item",
          "id": "0GRo`d0+y%cB!?V1|dDC"
        }
      ]
    },
    "pythonPreview": "teamA = None\nteamB = None\n\n\nteamA = ['Ana', 'Ben']\nteamB = ['Cleo']\nprint(teamA + teamB)",
    "goal": "Combine two separate team rosters into one.",
    "role": "The Concatenate Two Lists block merges them together.",
    "interaction": "It takes teamA and teamB as its two inputs and produces one new combined list for Print."
  },
  "list_remove_value": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "z(DB+cy`rw=+G6z8tFqo",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "wVhQ;,Q0Q0GfvPV1634r"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "u1/$EZL(6D_A;;Gz9V(t",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "qN0KXQSx6t_muU{=Ohpi",
                        "fields": {
                          "TEXT": "wash dishes"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "6fgt`I%g/c)n4^dX%^#V",
                        "fields": {
                          "TEXT": "homework"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "TYB7D57#]mqie.jp*#P~",
                        "fields": {
                          "TEXT": "walk dog"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "list_remove_value",
                "id": "1lBlZmct~:Cypc(ZVH-t",
                "inputs": {
                  "ITEM": {
                    "block": {
                      "type": "text",
                      "id": "^c+XK~,G1Q)wd]|O/1eX",
                      "fields": {
                        "TEXT": "homework"
                      }
                    }
                  },
                  "LIST": {
                    "block": {
                      "type": "variables_get",
                      "id": "`w]SS*b98Wa2QU46j4hz",
                      "fields": {
                        "VAR": {
                          "id": "wVhQ;,Q0Q0GfvPV1634r"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "HILr3B/;R`Hg!(YZQv-S",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "^4hIgkye5sOapCUT=*jY",
                          "fields": {
                            "VAR": {
                              "id": "wVhQ;,Q0Q0GfvPV1634r"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "tasks",
          "id": "wVhQ;,Q0Q0GfvPV1634r"
        },
        {
          "name": "item",
          "id": "[)veK!T*:5=R(5{%S/[*"
        }
      ]
    },
    "pythonPreview": "tasks = None\n\n\ntasks = ['wash dishes', 'homework', 'walk dog']\ntasks.remove('homework')\nprint(tasks)",
    "goal": "Cross 'homework' off a list of chores.",
    "role": "The Remove Value From List block finds and deletes that specific item.",
    "interaction": "It takes the item to remove and the tasks list as inputs, modifying tasks directly."
  },
  "list_pop": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "e0q!-):)0n)CBs-sDYBw",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "3IffR$M6OBOZB~dQaM5L"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "W!SDKaa6i5eum_fi{Edw",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "n!uL-$95M:w_;)/-zzS|",
                        "fields": {
                          "TEXT": "type"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "9p=gPtliC49K1efOE@0G",
                        "fields": {
                          "TEXT": "bold"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "Dpwy2xXi#3#ZB7:,JK.F",
                        "fields": {
                          "TEXT": "italic"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "variables_set",
                "id": "e:Ea2.F%%?LRX6@V~k_.",
                "fields": {
                  "VAR": {
                    "id": "(y2ZT3!fuDW2*#7yWq8p"
                  }
                },
                "inputs": {
                  "VALUE": {
                    "block": {
                      "type": "list_pop",
                      "id": "MY[u%r3s?M1ASi~PxaR3",
                      "inputs": {
                        "LIST": {
                          "block": {
                            "type": "variables_get",
                            "id": "iNd:U{nMz.;a98[-CCLo",
                            "fields": {
                              "VAR": {
                                "id": "3IffR$M6OBOZB~dQaM5L"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "PH{@-gj}cNNCochd=D9+",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "dan/xBny[~Y+oA=zLFhE",
                          "fields": {
                            "VAR": {
                              "id": "(y2ZT3!fuDW2*#7yWq8p"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "undo_stack",
          "id": "3IffR$M6OBOZB~dQaM5L"
        },
        {
          "name": "last_action",
          "id": "(y2ZT3!fuDW2*#7yWq8p"
        },
        {
          "name": "item",
          "id": "09=B/ni:dZ!D1#^P7B^)"
        }
      ]
    },
    "pythonPreview": "undo_stack = None\nlast_action = None\n\n\nundo_stack = ['type', 'bold', 'italic']\nlast_action = undo_stack.pop()\nprint(last_action)",
    "goal": "Undo the most recent formatting action in a simple editor.",
    "role": "The Pop Last Item block removes and hands back the most recent action.",
    "interaction": "It takes the undo_stack list as input, removes its last item, and stores that removed value in last_action for Print."
  },
  "list_pop_statement": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "lnLt^vW+8MRCc+)gW)Pk",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "%NgG0s;N$PG%CZCr=tu7"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "V}OfNsPNDL`oD;fp[/81",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "p%EQ|{HXB7i|u?wqdy7l",
                        "fields": {
                          "TEXT": "A"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "L4lGgPQE.g)(==/1h|vx",
                        "fields": {
                          "TEXT": "B"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "sVZIit}WSA={@RiLAIG3",
                        "fields": {
                          "TEXT": "C"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "list_pop_statement",
                "id": "[3WOj[$#+4rMde6)4~/!",
                "inputs": {
                  "LIST": {
                    "block": {
                      "type": "variables_get",
                      "id": "jw.(//[.rduLQ+R5N+Sm",
                      "fields": {
                        "VAR": {
                          "id": "%NgG0s;N$PG%CZCr=tu7"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "IMHt-R@/Mn9B]^Lj_*r+",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "7{;K#0M6tx`a|hID*AsO",
                          "fields": {
                            "VAR": {
                              "id": "%NgG0s;N$PG%CZCr=tu7"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "queue_display",
          "id": "%NgG0s;N$PG%CZCr=tu7"
        },
        {
          "name": "item",
          "id": "e5h~;JXBsNTL?oG:gNEu"
        }
      ]
    },
    "pythonPreview": "queue_display = None\n\n\nqueue_display = ['A', 'B', 'C']\nqueue_display.pop()\nprint(queue_display)",
    "goal": "Discard the most recent browsing history entry.",
    "role": "The Pop Last Item (Discard) block removes the last item without keeping it.",
    "interaction": "It takes the queue_display list as input and shrinks it by one, with no return value to capture."
  },
  "list_slice_advanced": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "@3I}r_)DejF*0X3NWgvh",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "Wz:LmUso5n(_2uwrIeos"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "of~X1v}*@+TP3VG2?I+}",
                  "extraState": {
                    "itemCount": 5
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "e@)KP/#^f;NzR,{tP].%",
                        "fields": {
                          "TEXT": "a"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "8bJo~.BPb{elc[:+;F,!",
                        "fields": {
                          "TEXT": "b"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "Urz(A]Kl~XDsWBrf!Bmr",
                        "fields": {
                          "TEXT": "c"
                        }
                      }
                    },
                    "ADD3": {
                      "block": {
                        "type": "text",
                        "id": "uIDPc@Mc|TBmhhcI]wbj",
                        "fields": {
                          "TEXT": "d"
                        }
                      }
                    },
                    "ADD4": {
                      "block": {
                        "type": "text",
                        "id": "w2~YV($OcY*kI.hT7Rou",
                        "fields": {
                          "TEXT": "e"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "S)_RarTwpWVL{8RB2WG7",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "list_slice_advanced",
                      "id": "T5]]I.opNwSDn]n]^])~",
                      "inputs": {
                        "LIST": {
                          "block": {
                            "type": "variables_get",
                            "id": "tthh9ju[]LQYBD}6A@Yx",
                            "fields": {
                              "VAR": {
                                "id": "Wz:LmUso5n(_2uwrIeos"
                              }
                            }
                          }
                        },
                        "START": {
                          "block": {
                            "type": "math_number",
                            "id": "ypW%@0,{[4~~f!bn89e;",
                            "fields": {
                              "NUM": 1
                            }
                          }
                        },
                        "END": {
                          "block": {
                            "type": "math_number",
                            "id": ".A/A=nH?L{ck{F(8ZP{/",
                            "fields": {
                              "NUM": 3
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "letters",
          "id": "Wz:LmUso5n(_2uwrIeos"
        },
        {
          "name": "item",
          "id": "=^[rf7t]hO20w/yZ}xg-"
        }
      ]
    },
    "pythonPreview": "letters = None\n\n\nletters = ['a', 'b', 'c', 'd', 'e']\nprint(letters[1:3])",
    "goal": "Grab the middle letters out of a 5-letter sequence.",
    "role": "The Slice List block extracts just the requested range.",
    "interaction": "It takes the letters list plus start (1) and end (3) indices, producing a shorter list for Print."
  },
  "list_sort": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "f#YZ;)iOguN=tKx;}hU*",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "C5lFXb!ZLI}X$TN~C0do"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "YgH,SpY%j8,+oI~:*^6P",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "math_number",
                        "id": "ifj0u?N1*1a^|l0bO`[b",
                        "fields": {
                          "NUM": 42
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "math_number",
                        "id": "[NEdLLnS,`LSihb~f.K]",
                        "fields": {
                          "NUM": 7
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "math_number",
                        "id": "9PUUTjC5TYjZ^G`lS$cA",
                        "fields": {
                          "NUM": 19
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "list_sort",
                "id": "kX$cxLy_sM6_W5NoVE]I",
                "fields": {
                  "REVERSE": "FALSE"
                },
                "inputs": {
                  "LIST": {
                    "block": {
                      "type": "variables_get",
                      "id": "9kuf8?K7dCT[@$fXEzME",
                      "fields": {
                        "VAR": {
                          "id": "C5lFXb!ZLI}X$TN~C0do"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "ZI:=yBDLKV-7fGv)%VP7",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "aY{#NwD^/fJG3^]ZgI;6",
                          "fields": {
                            "VAR": {
                              "id": "C5lFXb!ZLI}X$TN~C0do"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "scores",
          "id": "C5lFXb!ZLI}X$TN~C0do"
        },
        {
          "name": "item",
          "id": "L[s:*qt;:pX-toUA({N~"
        }
      ]
    },
    "pythonPreview": "scores = None\n\n\nscores = [42, 7, 19]\nscores.sort()\nprint(scores)",
    "goal": "Put a list of scores in order, permanently.",
    "role": "The Sort List In-Place block rearranges the original list itself.",
    "interaction": "It takes the scores list as input and reorders it directly \u2014 nothing needs to be reassigned afterward."
  },
  "list_sorted": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "w@8ro^j+#zri?9)n}E||",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "6]rNt2VhT@_}8_LE1*tL"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "k%th3NzY0J2YFZSy8^hB",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "math_number",
                        "id": "egz;RW#wa%/_dwEo^mYu",
                        "fields": {
                          "NUM": 42
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "math_number",
                        "id": "Ra:JFZAst$(f+!:+1vJK",
                        "fields": {
                          "NUM": 7
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "math_number",
                        "id": "{Ktj}Ah|FCuFrw%ZT[:;",
                        "fields": {
                          "NUM": 19
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "aFrxv2:9P~KWrlR$PO!M",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "list_sorted",
                      "id": "ueG8*)?fP+)*52V_MvUD",
                      "fields": {
                        "REVERSE": "FALSE"
                      },
                      "inputs": {
                        "LIST": {
                          "block": {
                            "type": "variables_get",
                            "id": "n,jmh#$#t[~~F#Dfh.^L",
                            "fields": {
                              "VAR": {
                                "id": "6]rNt2VhT@_}8_LE1*tL"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "fm[T!YC#=hyLf;I.ig=z",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "O^P?0:MTbjf~eoHey;/^",
                          "fields": {
                            "VAR": {
                              "id": "6]rNt2VhT@_}8_LE1*tL"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "scores",
          "id": "6]rNt2VhT@_}8_LE1*tL"
        },
        {
          "name": "item",
          "id": "Lu_memYnY#B{g^IXV5K5"
        }
      ]
    },
    "pythonPreview": "scores = None\n\n\nscores = [42, 7, 19]\nprint(sorted(scores))\nprint(scores)",
    "goal": "Get a sorted view of a scores list while keeping the original order intact elsewhere.",
    "role": "The Sorted Copy Of List block builds a brand-new sorted list.",
    "interaction": "It takes the scores list as input and returns a new sorted list, leaving the original scores completely unchanged."
  },
  "list_reverse": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "@3;tzck*DI~gyVzN*_1(",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "!t}@{fD-^nB`F#NofmjD"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "e%fv2^T:7Wt2$mi3X97i",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "/ZK%;m0kleuVi!_Yn?eO",
                        "fields": {
                          "TEXT": "1st"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "q7QwWl9hIZ5:pnvlo(2~",
                        "fields": {
                          "TEXT": "2nd"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "GB!9$io!`DIxi]dXE`r8",
                        "fields": {
                          "TEXT": "3rd"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "list_reverse",
                "id": "^#|-7+r{Yhfzs(.uz0nv",
                "inputs": {
                  "LIST": {
                    "block": {
                      "type": "variables_get",
                      "id": "3M]6i|%_5SdBtAEHK6D7",
                      "fields": {
                        "VAR": {
                          "id": "!t}@{fD-^nB`F#NofmjD"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "(WFs^8$Uxgcz;B-$}OZf",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "^|+n7B{C:,TjyQ7gy=fm",
                          "fields": {
                            "VAR": {
                              "id": "!t}@{fD-^nB`F#NofmjD"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "order",
          "id": "!t}@{fD-^nB`F#NofmjD"
        },
        {
          "name": "item",
          "id": "nE~2~d_1*6TrG5E};Dpg"
        }
      ]
    },
    "pythonPreview": "order = None\n\n\norder = ['1st', '2nd', '3rd']\norder.reverse()\nprint(order)",
    "goal": "Flip the order of a ranked list, in place.",
    "role": "The Reverse List block does the flipping.",
    "interaction": "It takes the order list as input and reverses it directly, so printing order afterward shows the new sequence."
  },
  "list_clear": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "[m=mRI-ox8LuY{Z#!T(0",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "rnasi4TPfqvzIZsFK^T`"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "BN/yCQ3|xf{v@mX._[,@",
                  "extraState": {
                    "itemCount": 2
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": ".DWky@k{lkcA,Re~iT.#",
                        "fields": {
                          "TEXT": "milk"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "|wx?+EsU,$pCfUv`y|r4",
                        "fields": {
                          "TEXT": "bread"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "list_clear",
                "id": "xmgf)+rPSpR2MHq}6RX-",
                "inputs": {
                  "LIST": {
                    "block": {
                      "type": "variables_get",
                      "id": "WZvxDq[Qv}A}7XJ76Uqp",
                      "fields": {
                        "VAR": {
                          "id": "rnasi4TPfqvzIZsFK^T`"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "Y+o,P)qNOBK0xnuh_*nl",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "lJtVzqas+A1($G2Sw]W?",
                          "fields": {
                            "VAR": {
                              "id": "rnasi4TPfqvzIZsFK^T`"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "cart",
          "id": "rnasi4TPfqvzIZsFK^T`"
        },
        {
          "name": "item",
          "id": "_O~koKVI~T|D,H#7{d%m"
        }
      ]
    },
    "pythonPreview": "cart = None\n\n\ncart = ['milk', 'bread']\ncart.clear()\nprint(cart)",
    "goal": "Empty a shopping cart completely.",
    "role": "The Clear List/Dictionary block wipes out every item at once.",
    "interaction": "It takes the cart list as input and empties it directly \u2014 no replacement value is produced."
  },
  "list_insert": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": ";6x,}g}#jxKYk*BJqwL^",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "Yy7uDrCBU,;qnHnhYN94"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "[}KF5_Tkfsj-.0#sX)6;",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "hLMZvu-+E/1k=!kA^ovo",
                        "fields": {
                          "TEXT": "Ann"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "PAh;L?|g0:wX~E$*B(-_",
                        "fields": {
                          "TEXT": "Ben"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "nh8)RZJUnz#(M(E0s9mI",
                        "fields": {
                          "TEXT": "Cid"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "list_insert",
                "id": "E_;(Yt(H3614E{j0Ha$!",
                "inputs": {
                  "ITEM": {
                    "block": {
                      "type": "text",
                      "id": "O,CT~9DA+5R9z48M%{Dz",
                      "fields": {
                        "TEXT": "Priority Pat"
                      }
                    }
                  },
                  "INDEX": {
                    "block": {
                      "type": "math_number",
                      "id": "T*Z-0uw9PQ2xx~;%#fu{",
                      "fields": {
                        "NUM": 0
                      }
                    }
                  },
                  "LIST": {
                    "block": {
                      "type": "variables_get",
                      "id": "UnNIF8-EfvXOjD2p?g{$",
                      "fields": {
                        "VAR": {
                          "id": "Yy7uDrCBU,;qnHnhYN94"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "MaPX=I[4=?:]`@1V`x#H",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "l=$p[~+RP|9bX(2}jU`V",
                          "fields": {
                            "VAR": {
                              "id": "Yy7uDrCBU,;qnHnhYN94"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "queue",
          "id": "Yy7uDrCBU,;qnHnhYN94"
        },
        {
          "name": "item",
          "id": "{H2],ML?Qd8`3IsEO/z9"
        }
      ]
    },
    "pythonPreview": "queue = None\n\n\nqueue = ['Ann', 'Ben', 'Cid']\nqueue.insert(0, 'Priority Pat')\nprint(queue)",
    "goal": "Insert a priority customer at the very front of a queue.",
    "role": "The Insert At Index block places the new item at a specific position.",
    "interaction": "It takes the new name, the target index (0), and the queue list as inputs, shifting everyone else down by one."
  },
  "list_count": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "uyL7TF(-Stwa+J/,)2=E",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "y^.,uL@EXN=2Uk=!UQ`r"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "G`Zoi;|hIw+c$uT|klQw",
                  "extraState": {
                    "itemCount": 4
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "=i5R^]yo6+T!yZzrIa~p",
                        "fields": {
                          "TEXT": "yes"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "FS_T_!_~GR{ogMV=oNgb",
                        "fields": {
                          "TEXT": "no"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "0O6L;Y.{*=T8H?9+v7Fp",
                        "fields": {
                          "TEXT": "yes"
                        }
                      }
                    },
                    "ADD3": {
                      "block": {
                        "type": "text",
                        "id": "2X~MLUqea?qY16e/,Z_O",
                        "fields": {
                          "TEXT": "yes"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "|Z[mv!u}-?OoiR/d+L}[",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "list_count",
                      "id": "[:CeuVoZ6Wg+N#*d=O)x",
                      "inputs": {
                        "ITEM": {
                          "block": {
                            "type": "text",
                            "id": "J!;{{*[BFr7m;4aH$kPE",
                            "fields": {
                              "TEXT": "yes"
                            }
                          }
                        },
                        "LIST": {
                          "block": {
                            "type": "variables_get",
                            "id": "!(6;=8|8NB*NUr=ycE(E",
                            "fields": {
                              "VAR": {
                                "id": "y^.,uL@EXN=2Uk=!UQ`r"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "votes",
          "id": "y^.,uL@EXN=2Uk=!UQ`r"
        },
        {
          "name": "item",
          "id": "d,pA7QpMWisFVl6#D824"
        }
      ]
    },
    "pythonPreview": "votes = None\n\n\nvotes = ['yes', 'no', 'yes', 'yes']\nprint(votes.count('yes'))",
    "goal": "Count how many 'yes' votes were cast.",
    "role": "The Count Occurrences In List block does the tallying.",
    "interaction": "It takes the item to search for and the votes list as inputs, and its numeric result is passed to Print."
  },
  "list_range": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "uIJKv0q;@Zp%Yg6K:=.g",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "list_range",
                  "id": ":g7*~Wqtlb-?@=]-yx6F",
                  "inputs": {
                    "START": {
                      "block": {
                        "type": "math_number",
                        "id": "AC(,ixP2{3*rF5:Yt70J",
                        "fields": {
                          "NUM": 1
                        }
                      }
                    },
                    "END": {
                      "block": {
                        "type": "math_number",
                        "id": "GPBCv)2BFMgkJG^Spm4|",
                        "fields": {
                          "NUM": 6
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print(list(range(1, 6)))",
    "goal": "Generate the numbers 1 through 5 as a list.",
    "role": "The Create Range Of Numbers block builds the sequence.",
    "interaction": "It takes a start (1) and end (6, exclusive) and produces a ready-made list for Print."
  },
  "lists_repeat": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "b_HxP^zu?O~GLOj7X=/H",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "lists_repeat",
                  "id": "x0h8+#UBZLflE)P@?NV*",
                  "inputs": {
                    "ITEM": {
                      "block": {
                        "type": "math_number",
                        "id": "-I!*Slb{#a@E.Y!)@)`.",
                        "fields": {
                          "NUM": 0
                        }
                      }
                    },
                    "NUM": {
                      "block": {
                        "type": "math_number",
                        "id": "wRa@m-t[PBH9dvjF-M1-",
                        "fields": {
                          "NUM": 5
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print([0] * 5)",
    "goal": "Create a list of five zeros to use as a starting scoreboard.",
    "role": "The Create List Repeated block builds the list by repetition.",
    "interaction": "It takes the value to repeat (0) and how many times (5), producing a ready-made list for Print."
  },
  "lists_length": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "bx#exB^r[k^CV}cH$M~w",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "a!b!~{Xr5sW9YCNL8wET"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "~D#UR1]$JC-G.6^`Y+qj",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "3.):r~@d(SFPE%oie^m5",
                        "fields": {
                          "TEXT": "Ana"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "5K;En)mOfFJY|I!Swbgj",
                        "fields": {
                          "TEXT": "Ben"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "@*sPgeZ)VT@isXfFLdzX",
                        "fields": {
                          "TEXT": "Cleo"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "Z3V~d?Z1@K*!3y.~mn5s",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "lists_length",
                      "id": "L]iQH$c[2Q_ky:9*=N/|",
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "variables_get",
                            "id": "(G)RM|ApMC0KQ2]S2`/w",
                            "fields": {
                              "VAR": {
                                "id": "a!b!~{Xr5sW9YCNL8wET"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "roster",
          "id": "a!b!~{Xr5sW9YCNL8wET"
        },
        {
          "name": "item",
          "id": ")Ny|eZXF[w#W$aDa.ry+"
        }
      ]
    },
    "pythonPreview": "roster = None\n\n\nroster = ['Ana', 'Ben', 'Cleo']\nprint(len(roster))",
    "goal": "Find out how many students are on a roster.",
    "role": "The Length Of List block counts the items.",
    "interaction": "It takes the roster list as input and its numeric result is passed to Print."
  },
  "lists_isEmpty": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": ")^=5iep9=WFhBF2X7NiA",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "h!I6MN?D`U;#]qfl;-70"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "xk5|SC|ypB[WwkzyxIjG",
                  "extraState": {
                    "itemCount": 0
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "D}Vd8qb8W;8]Whr;IwU,",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "lists_isEmpty",
                      "id": ".?pW!]rvDvRz9wMNAc=C",
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "variables_get",
                            "id": "H2841=.[f.KO|C-Zflg]",
                            "fields": {
                              "VAR": {
                                "id": "h!I6MN?D`U;#]qfl;-70"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "inbox",
          "id": "h!I6MN?D`U;#]qfl;-70"
        },
        {
          "name": "item",
          "id": "e@sx)Mo)?J=BscFQ){a("
        }
      ]
    },
    "pythonPreview": "inbox = None\n\n\ninbox = []\nprint(not len(inbox))",
    "goal": "Check whether an inbox has any messages at all.",
    "role": "The Is List Empty block performs the check.",
    "interaction": "It takes the inbox list as input and outputs True/False, which Print then displays."
  },
  "lists_indexOf": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "o9Vn-)M8]Z$+^)`g2A@B",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "1`hQMjMn}P04d`Wx+NH#"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "yU_aBB#AS_@G^}:pwa6)",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "Q6o$k}4@tucf31gl1_0d",
                        "fields": {
                          "TEXT": "Kim"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "VL`A4]FcLEI|(umz6MdU",
                        "fields": {
                          "TEXT": "Sam"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "1zgmBs3egaVgmE3u2A4L",
                        "fields": {
                          "TEXT": "Lee"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "g_Cog+$,waza*h%fhsWg",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "lists_indexOf",
                      "id": "eUwdT/@Ja1l0~HR*o-iW",
                      "fields": {
                        "END": "FIRST"
                      },
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "variables_get",
                            "id": "7K_|u+@-,mI}zNcmTlZ%",
                            "fields": {
                              "VAR": {
                                "id": "1`hQMjMn}P04d`Wx+NH#"
                              }
                            }
                          }
                        },
                        "FIND": {
                          "block": {
                            "type": "text",
                            "id": "^@x}z1JT(}`z#ydQa6Jk",
                            "fields": {
                              "TEXT": "Lee"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "runners",
          "id": "1`hQMjMn}P04d`Wx+NH#"
        },
        {
          "name": "item",
          "id": "01U+6:98YP;9*qX+xn@u"
        }
      ]
    },
    "pythonPreview": "runners = None\n\n\ndef first_index(my_list, elem):\n  try: index = my_list.index(elem) + 1\n  except: index = 0\n\n  return index\n\n\nrunners = ['Kim', 'Sam', 'Lee']\nprint(first_index(runners, 'Lee'))",
    "goal": "Find which position a specific runner is in.",
    "role": "The Find Item In List block searches for the position.",
    "interaction": "It takes the item to find and the runners list as inputs, and its found position is passed to Print."
  },
  "lists_getIndex": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "*,ZQ:FvmhWOm.[x?EcU_",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "@*Fnv65hJ1F.A~#t8[PV"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "GPRg17wYYp)Hwv!#RCyZ",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "$SzwbXOJo1]2bK2$NHK!",
                        "fields": {
                          "TEXT": "Gold"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "Pgz|w2V`ZR[@J.u$C3bt",
                        "fields": {
                          "TEXT": "Silver"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "7q`b|:AfdT9|+`I!l7Bd",
                        "fields": {
                          "TEXT": "Bronze"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "|uNG(}*o`Njdsr@Cr2Ok",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "lists_getIndex",
                      "id": "ZD,2K,s?46H16|:;/Hec",
                      "fields": {
                        "MODE": "GET",
                        "WHERE": "FIRST"
                      },
                      "inputs": {
                        "VALUE": {
                          "block": {
                            "type": "variables_get",
                            "id": "0bA[FbDm^kaN}gwZek7Q",
                            "fields": {
                              "VAR": {
                                "id": "@*Fnv65hJ1F.A~#t8[PV"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "podium",
          "id": "@*Fnv65hJ1F.A~#t8[PV"
        },
        {
          "name": "item",
          "id": ")VyjRfMfx?Cd:wwp`)`m"
        }
      ]
    },
    "pythonPreview": "podium = None\n\n\npodium = ['Gold', 'Silver', 'Bronze']\nprint(podium[0])",
    "goal": "Read the gold-medal name off a podium list.",
    "role": "The Get Item At Index block retrieves one specific item.",
    "interaction": "It takes the podium list as input with 'first' selected, and passes that one item to Print."
  },
  "lists_setIndex": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "QQhCR^qru1*@ALEFVhD!",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "b:O,wx/RjQF3IewU|Rji"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "s#q8N{6K*lTJnPmP+IZb",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "math_number",
                        "id": "N`._2TI1QGyU[WK0VibL",
                        "fields": {
                          "NUM": 10
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "math_number",
                        "id": "6)qkla_#9Zgt^xE1ZYAu",
                        "fields": {
                          "NUM": 20
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "math_number",
                        "id": "OBiV)O)2]A8Xa:idip@~",
                        "fields": {
                          "NUM": 30
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "lists_setIndex",
                "id": "pWqAz_y/mK7P4g1XuL9V",
                "fields": {
                  "MODE": "SET",
                  "WHERE": "FIRST"
                },
                "inputs": {
                  "LIST": {
                    "block": {
                      "type": "variables_get",
                      "id": "@KK(ojxOdjr?)5XA9240",
                      "fields": {
                        "VAR": {
                          "id": "b:O,wx/RjQF3IewU|Rji"
                        }
                      }
                    }
                  },
                  "TO": {
                    "block": {
                      "type": "math_number",
                      "id": "_@?4IN1WnWVbly+VqK];",
                      "fields": {
                        "NUM": 99
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "$tIRky^h/[tmZ~TATDD)",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "{ub@,cRB=1Sv6{9v^~Av",
                          "fields": {
                            "VAR": {
                              "id": "b:O,wx/RjQF3IewU|Rji"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "scores",
          "id": "b:O,wx/RjQF3IewU|Rji"
        },
        {
          "name": "item",
          "id": "/n:WyBDSyT$Y|Y3T`Kc/"
        }
      ]
    },
    "pythonPreview": "scores = None\n\n\nscores = [10, 20, 30]\nscores[0] = 99\nprint(scores)",
    "goal": "Correct a mistaken score at a specific position.",
    "role": "The Set Item At Index block overwrites that one slot.",
    "interaction": "It takes the scores list and the new value (99) with 'first' selected, replacing that slot directly."
  },
  "lists_getSublist": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "c8;H(@X}a?D{B{dRlZ3D",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "gskl)YvE;Bo4-R(t8a}2"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "x2t(1nP6WnJ[_}S#*(,^",
                  "extraState": {
                    "itemCount": 5
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "VjkHpBfTJ7|O+uzZODe+",
                        "fields": {
                          "TEXT": "a"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "y/pD8{xcs91j*WgqkDwT",
                        "fields": {
                          "TEXT": "b"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "UI*Y0(lI,F=#u}e}=D?B",
                        "fields": {
                          "TEXT": "c"
                        }
                      }
                    },
                    "ADD3": {
                      "block": {
                        "type": "text",
                        "id": "rXq3@hvg!gPA0M,B4@,N",
                        "fields": {
                          "TEXT": "d"
                        }
                      }
                    },
                    "ADD4": {
                      "block": {
                        "type": "text",
                        "id": "hciCe_K7.DJPz{nx}%U3",
                        "fields": {
                          "TEXT": "e"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "G=7me9nc6r8|7s7SHA@3",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "lists_getSublist",
                      "id": ";-`[jU3MI.|=hFJ;-kf)",
                      "fields": {
                        "WHERE1": "FIRST",
                        "WHERE2": "LAST"
                      },
                      "inputs": {
                        "LIST": {
                          "block": {
                            "type": "variables_get",
                            "id": "~NkC2;74@X_DcWg[daEe",
                            "fields": {
                              "VAR": {
                                "id": "gskl)YvE;Bo4-R(t8a}2"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "letters",
          "id": "gskl)YvE;Bo4-R(t8a}2"
        },
        {
          "name": "item",
          "id": "Wyv7ywQocXG~R!a`V,Q."
        }
      ]
    },
    "pythonPreview": "letters = None\n\n\nletters = ['a', 'b', 'c', 'd', 'e']\nprint(letters[ : ])",
    "goal": "Grab the entire sequence of letters as a sub-list copy.",
    "role": "The Get Sublist block extracts the requested range.",
    "interaction": "It takes the letters list with First/Last selected as its bounds, producing a new list for Print."
  },
  "lists_split": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "RnOJ~/#DMBs+hk){I4y2",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "wnRqayEI%hU_a1u%rWbI"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "*,#5_{d-nd/zS}ITcU1n",
                  "fields": {
                    "TEXT": "one,two,three"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "@3[lR^ru^2$Aj~vjow7:",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "lists_split",
                      "id": "(zi=ybF^zD)qaX$K$LyM",
                      "extraState": {
                        "mode": "SPLIT"
                      },
                      "fields": {
                        "MODE": "SPLIT"
                      },
                      "inputs": {
                        "INPUT": {
                          "block": {
                            "type": "variables_get",
                            "id": "J;+UMk/,LLz.3(A:Mf3}",
                            "fields": {
                              "VAR": {
                                "id": "wnRqayEI%hU_a1u%rWbI"
                              }
                            }
                          }
                        },
                        "DELIM": {
                          "block": {
                            "type": "text",
                            "id": "5$![pIXYEyi(dwZ(Swp{",
                            "fields": {
                              "TEXT": ","
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "csv",
          "id": "wnRqayEI%hU_a1u%rWbI"
        },
        {
          "name": "item",
          "id": "ixpq.@?D?irT8N)g_bxe"
        }
      ]
    },
    "pythonPreview": "csv = None\n\n\ncsv = 'one,two,three'\nprint(csv.split(','))",
    "goal": "Turn a comma-separated string back into a list of words.",
    "role": "The Split/Join String \u21c4 List block performs the conversion.",
    "interaction": "It takes the csv text and the comma delimiter as inputs, with 'split' selected, producing a list for Print."
  },
  "lists_sort": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "S:?oJyo{_0V#/AkxK9-g",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "60JIGORs7e+*pq7#p]wq"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "pSZ)xKv|(^wrs;h2{xx[",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "3/$foEP*xgdP,EKI]-KI",
                        "fields": {
                          "TEXT": "Zoe"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "fnEs,0cu~^1=3hUv{4jC",
                        "fields": {
                          "TEXT": "Amir"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "PX}q$Ft/Hc=akKMDLwq}",
                        "fields": {
                          "TEXT": "Mona"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "3n)}8(O$PQPwDcoDAG8M",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "lists_sort",
                      "id": "H2B:r4{=9Y6;c{EOG|L~",
                      "fields": {
                        "TYPE": "TEXT",
                        "DIRECTION": "1"
                      },
                      "inputs": {
                        "LIST": {
                          "block": {
                            "type": "variables_get",
                            "id": "k|~/bBa~_wuL6XT_fG83",
                            "fields": {
                              "VAR": {
                                "id": "60JIGORs7e+*pq7#p]wq"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "names",
          "id": "60JIGORs7e+*pq7#p]wq"
        },
        {
          "name": "item",
          "id": "%eEPm*?iZ(ceqIK}VmVX"
        }
      ]
    },
    "pythonPreview": "names = None\n\n\ndef lists_sort(my_list, type, reverse):\n  def try_float(s):\n    try:\n      return float(s)\n    except:\n      return 0\n  key_funcs = {\n    \"NUMERIC\": try_float,\n    \"TEXT\": str,\n    \"IGNORE_CASE\": lambda s: str(s).lower()\n  }\n  key_func = key_funcs[type]\n  list_cpy = list(my_list)\n\n  return sorted(list_cpy, key=key_func, reverse=reverse)\n\n\nnames = ['Zoe', 'Amir', 'Mona']\nprint(lists_sort(names, \"TEXT\", False))",
    "goal": "Alphabetically sort a list of names using Blockly's built-in sort block.",
    "role": "The Sorted Copy Of List (Built-in) block performs the sort.",
    "interaction": "It takes the names list as input with text/ascending selected, and its sorted result is passed to Print."
  },
  "dict_create_empty": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "lBK0[gU|}Fh:Qc(iNc)Y",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "0y_+[fX|]vMA=k.SR*ty"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "dict_create_empty",
                  "id": "n[CFZQ@#5WiuwHu+9#MD"
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "nG?.;Ekj{XVp=!%{!%)t",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "variables_get",
                      "id": "c=Aet{HHP+YT~61fwR7G",
                      "fields": {
                        "VAR": {
                          "id": "0y_+[fX|]vMA=k.SR*ty"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "grades",
          "id": "0y_+[fX|]vMA=k.SR*ty"
        },
        {
          "name": "item",
          "id": "Rbij(_5G7nr[MOm3BV/4"
        }
      ]
    },
    "pythonPreview": "grades = None\n\n\ngrades = {}\nprint(grades)",
    "goal": "Start a fresh grade book with nothing in it yet.",
    "role": "The Create Empty Dictionary block gives you a blank dictionary to build on.",
    "interaction": "Its empty result is stored in the grades variable, ready for entries to be added later."
  },
  "dict_set": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "F1D!9W-5VA!JY?3xHkh[",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "F=m2aWvt[rc06ES`c=f4"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "dict_create_empty",
                  "id": "ABVNsq+0sM^1(%*to0s~"
                }
              }
            },
            "next": {
              "block": {
                "type": "dict_set",
                "id": "dn,_bLI_6`!!4h.ff4AG",
                "inputs": {
                  "DICT": {
                    "block": {
                      "type": "variables_get",
                      "id": "NonE)wrfkfDE1=B#E%S[",
                      "fields": {
                        "VAR": {
                          "id": "F=m2aWvt[rc06ES`c=f4"
                        }
                      }
                    }
                  },
                  "KEY": {
                    "block": {
                      "type": "text",
                      "id": "}.N:2Da|{x$n-kIP/uAU",
                      "fields": {
                        "TEXT": "Maria"
                      }
                    }
                  },
                  "VALUE": {
                    "block": {
                      "type": "math_number",
                      "id": "nh+0a-63,e8u=M_.3p[Z",
                      "fields": {
                        "NUM": 95
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "5xMX1xszga:4dSxOf0:N",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "#qxjX)^~eO,d8Q$N^Ih]",
                          "fields": {
                            "VAR": {
                              "id": "F=m2aWvt[rc06ES`c=f4"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "grades",
          "id": "F=m2aWvt[rc06ES`c=f4"
        },
        {
          "name": "item",
          "id": "$n6Vp6C55`ef6vfHKjrf"
        }
      ]
    },
    "pythonPreview": "grades = None\n\n\ngrades = {}\ngrades['Maria'] = 95\nprint(grades)",
    "goal": "Record Maria's grade in a grade book.",
    "role": "The Set Dictionary Key block adds the new key-value pair.",
    "interaction": "It takes the grades dictionary, the key 'Maria', and the value 95, storing that entry directly inside grades."
  },
  "dict_get": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "ZmN|g|=tIjT2N2i+ss[U",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "9P0E^SVd{qovG0=q!w|E"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "dict_create_empty",
                  "id": "F!ejNl1oQ?!Vt)[=w{}x"
                }
              }
            },
            "next": {
              "block": {
                "type": "dict_set",
                "id": "upE9uuJ@#5XjCH]oO5-y",
                "inputs": {
                  "DICT": {
                    "block": {
                      "type": "variables_get",
                      "id": "IQGUW2R$86k5WIQSgaXH",
                      "fields": {
                        "VAR": {
                          "id": "9P0E^SVd{qovG0=q!w|E"
                        }
                      }
                    }
                  },
                  "KEY": {
                    "block": {
                      "type": "text",
                      "id": "u?E`o)8~8*Cyd9/HLSW]",
                      "fields": {
                        "TEXT": "Maria"
                      }
                    }
                  },
                  "VALUE": {
                    "block": {
                      "type": "math_number",
                      "id": "puv,*Ot;*[#!s4%mYI#)",
                      "fields": {
                        "NUM": 95
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "0y4lN.r:lbB+PJ$Ig:-b",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "dict_get",
                          "id": "xJOZA!AwYbr.n7I~H_/B",
                          "inputs": {
                            "DICT": {
                              "block": {
                                "type": "variables_get",
                                "id": "E#s^~af?eo}]#k(JU^U!",
                                "fields": {
                                  "VAR": {
                                    "id": "9P0E^SVd{qovG0=q!w|E"
                                  }
                                }
                              }
                            },
                            "KEY": {
                              "block": {
                                "type": "text",
                                "id": "LEt2@%1H-t(398Ej/oto",
                                "fields": {
                                  "TEXT": "Maria"
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "grades",
          "id": "9P0E^SVd{qovG0=q!w|E"
        },
        {
          "name": "item",
          "id": "I;O^[-YvMtzJE))7SU5m"
        }
      ]
    },
    "pythonPreview": "grades = None\n\n\ngrades = {}\ngrades['Maria'] = 95\nprint(grades['Maria'])",
    "goal": "Look up Maria's grade after it's been recorded.",
    "role": "The Get Dictionary Key block performs the lookup.",
    "interaction": "It takes the grades dictionary and the key 'Maria' as inputs, and the found value is passed to Print."
  },
  "dict_pair": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "(OSZ2vo?f:Rw{jxk7V_Z",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "dict_from_pairs",
                  "id": "QmyijdE+vFlB4wlF$LBZ",
                  "inputs": {
                    "LIST": {
                      "block": {
                        "type": "lists_create_with",
                        "id": "t7LfsoK]e:$m~u=ApIoF",
                        "extraState": {
                          "itemCount": 2
                        },
                        "inputs": {
                          "ADD0": {
                            "block": {
                              "type": "dict_pair",
                              "id": "-B%b=o-Ywzf^Lkt3ScTk",
                              "inputs": {
                                "KEY": {
                                  "block": {
                                    "type": "text",
                                    "id": "C%{@5#:+Q-?gwQr@{3+@",
                                    "fields": {
                                      "TEXT": "name"
                                    }
                                  }
                                },
                                "VALUE": {
                                  "block": {
                                    "type": "text",
                                    "id": "[!0v2gvUk%[}3sMT;R1u",
                                    "fields": {
                                      "TEXT": "Ana"
                                    }
                                  }
                                }
                              }
                            }
                          },
                          "ADD1": {
                            "block": {
                              "type": "dict_pair",
                              "id": "#Kl5/v3J!~4ptI)LJ#e.",
                              "inputs": {
                                "KEY": {
                                  "block": {
                                    "type": "text",
                                    "id": "-@=IFYhEu}+OQ.zqrh(p",
                                    "fields": {
                                      "TEXT": "age"
                                    }
                                  }
                                },
                                "VALUE": {
                                  "block": {
                                    "type": "math_number",
                                    "id": "Id`8J*(bC7T@d=b`|@gR",
                                    "fields": {
                                      "NUM": 20
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print({\n    'name': 'Ana',\n    'age': 20\n})",
    "goal": "Build a small profile dictionary (name and age) from named pairs.",
    "role": "The Key : Value Pair block defines one entry that goes into the final dictionary.",
    "interaction": "Two of these pair blocks are collected inside a Create Dictionary From Pairs block, which assembles them into one dictionary."
  },
  "dict_from_pairs": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "oGeE(H}}7HlvnJ`mZi(D",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "dict_from_pairs",
                  "id": "OaA[OMn^OOyxshdd]alD",
                  "inputs": {
                    "LIST": {
                      "block": {
                        "type": "lists_create_with",
                        "id": "rxOvaMi2bXUHE:{WN_lP",
                        "extraState": {
                          "itemCount": 2
                        },
                        "inputs": {
                          "ADD0": {
                            "block": {
                              "type": "dict_pair",
                              "id": "A5,Z$7?Ch4gpzxgK8X.w",
                              "inputs": {
                                "KEY": {
                                  "block": {
                                    "type": "text",
                                    "id": "?1hy:AlkQ_UEE^c72}tj",
                                    "fields": {
                                      "TEXT": "name"
                                    }
                                  }
                                },
                                "VALUE": {
                                  "block": {
                                    "type": "text",
                                    "id": "aU*b$?K|5kWv7`syti5x",
                                    "fields": {
                                      "TEXT": "Ana"
                                    }
                                  }
                                }
                              }
                            }
                          },
                          "ADD1": {
                            "block": {
                              "type": "dict_pair",
                              "id": "s92GkM0PF4Q%AeZAvE29",
                              "inputs": {
                                "KEY": {
                                  "block": {
                                    "type": "text",
                                    "id": "58#mnqNl@;MAOzeL7[hz",
                                    "fields": {
                                      "TEXT": "age"
                                    }
                                  }
                                },
                                "VALUE": {
                                  "block": {
                                    "type": "math_number",
                                    "id": "-=DNsXLV1yy_fZWGlpmN",
                                    "fields": {
                                      "NUM": 20
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print({\n    'name': 'Ana',\n    'age': 20\n})",
    "goal": "Build a small profile dictionary (name and age) all at once.",
    "role": "The Create Dictionary From Pairs block assembles the final dictionary.",
    "interaction": "It takes a list of Key:Value Pair blocks as input and produces one complete dictionary for Print."
  },
  "dict_pop": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "*OxJ.q@.p^pN0Luz=-;g",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "e^9.]xob,3TRXU=[5S,:"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "dict_create_empty",
                  "id": "-Mux[pJm+rqj@H2Y|m(K"
                }
              }
            },
            "next": {
              "block": {
                "type": "dict_set",
                "id": "%)s;`F$KwJ9K/jH+M2y~",
                "inputs": {
                  "DICT": {
                    "block": {
                      "type": "variables_get",
                      "id": ";3kK3b4/H[~#9y,n5p!5",
                      "fields": {
                        "VAR": {
                          "id": "e^9.]xob,3TRXU=[5S,:"
                        }
                      }
                    }
                  },
                  "KEY": {
                    "block": {
                      "type": "text",
                      "id": ".wmj69:NELZ55E]YQthP",
                      "fields": {
                        "TEXT": "order1"
                      }
                    }
                  },
                  "VALUE": {
                    "block": {
                      "type": "text",
                      "id": "W1K|NMDINc|D*UXCxCsr",
                      "fields": {
                        "TEXT": "pizza"
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "variables_set",
                    "id": "E/@G4Z$@,70nTv}9AF,V",
                    "fields": {
                      "VAR": {
                        "id": "LN^gv.?-bRU*HVm4;X;c"
                      }
                    },
                    "inputs": {
                      "VALUE": {
                        "block": {
                          "type": "dict_pop",
                          "id": "5NfiH|AF!fpD1;P_r,4k",
                          "inputs": {
                            "KEY": {
                              "block": {
                                "type": "text",
                                "id": "p%NP^+!+.i_M(E!u7,:p",
                                "fields": {
                                  "TEXT": "order1"
                                }
                              }
                            },
                            "DICT": {
                              "block": {
                                "type": "variables_get",
                                "id": ":ZB1ZJEOxrGonrNpbI=E",
                                "fields": {
                                  "VAR": {
                                    "id": "e^9.]xob,3TRXU=[5S,:"
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    },
                    "next": {
                      "block": {
                        "type": "text_print",
                        "id": "YBx.1gMH;;1ce6tW2oI^",
                        "inputs": {
                          "TEXT": {
                            "block": {
                              "type": "variables_get",
                              "id": "%IG}TS]0d7pCVBbTn-%o",
                              "fields": {
                                "VAR": {
                                  "id": "LN^gv.?-bRU*HVm4;X;c"
                                }
                              }
                            }
                          }
                        },
                        "next": {
                          "block": {
                            "type": "text_print",
                            "id": "%yU,4hN%lYL+;j;xTx93",
                            "inputs": {
                              "TEXT": {
                                "block": {
                                  "type": "variables_get",
                                  "id": "qES@^x1]ucuOM!;86VLA",
                                  "fields": {
                                    "VAR": {
                                      "id": "e^9.]xob,3TRXU=[5S,:"
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "orders",
          "id": "e^9.]xob,3TRXU=[5S,:"
        },
        {
          "name": "completed",
          "id": "LN^gv.?-bRU*HVm4;X;c"
        },
        {
          "name": "item",
          "id": "2;lG{4_EvCNHSp#6e)OH"
        }
      ]
    },
    "pythonPreview": "orders = None\ncompleted = None\n\n\norders = {}\norders['order1'] = 'pizza'\ncompleted = orders.pop('order1')\nprint(completed)\nprint(orders)",
    "goal": "Mark an order as completed by removing it from a pending-orders dictionary.",
    "role": "The Remove Dictionary Key block deletes the entry and hands back its value in one step.",
    "interaction": "It takes the key 'order1' and the orders dictionary, removing that entry and storing the removed value in completed."
  },
  "dict_keys_values": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "%$uiyRWKrFc)y$4H__wc",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "y,xzi=8z}mnKzt7iqg1!"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "dict_create_empty",
                  "id": "lH+af;%*vgs3wH1,aLJq"
                }
              }
            },
            "next": {
              "block": {
                "type": "dict_set",
                "id": "b-(%nI3[m#wViIEYa/q*",
                "inputs": {
                  "DICT": {
                    "block": {
                      "type": "variables_get",
                      "id": "RqGD)t[h(A/[7h$Ev-jr",
                      "fields": {
                        "VAR": {
                          "id": "y,xzi=8z}mnKzt7iqg1!"
                        }
                      }
                    }
                  },
                  "KEY": {
                    "block": {
                      "type": "text",
                      "id": "LW/4}K:Jwnc.g$BWYtpV",
                      "fields": {
                        "TEXT": "Ana"
                      }
                    }
                  },
                  "VALUE": {
                    "block": {
                      "type": "math_number",
                      "id": "aM_Y$gv4nkWbutg)d[#A",
                      "fields": {
                        "NUM": 90
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "dict_set",
                    "id": "EXz@ay@]|nzb3N9JC,4O",
                    "inputs": {
                      "DICT": {
                        "block": {
                          "type": "variables_get",
                          "id": "X]tTGT(Brx(muyTjDyDt",
                          "fields": {
                            "VAR": {
                              "id": "y,xzi=8z}mnKzt7iqg1!"
                            }
                          }
                        }
                      },
                      "KEY": {
                        "block": {
                          "type": "text",
                          "id": "W^ftW4H1LM`UY$Y_BR-q",
                          "fields": {
                            "TEXT": "Ben"
                          }
                        }
                      },
                      "VALUE": {
                        "block": {
                          "type": "math_number",
                          "id": "2Ar]8/B?t#vKMVMDUgL`",
                          "fields": {
                            "NUM": 85
                          }
                        }
                      }
                    },
                    "next": {
                      "block": {
                        "type": "text_print",
                        "id": "2]%W?y!Mp6uY:={J60#l",
                        "inputs": {
                          "TEXT": {
                            "block": {
                              "type": "dict_keys_values",
                              "id": "B?SdE:#oEy+BA_NE}h)R",
                              "fields": {
                                "OP": "keys"
                              },
                              "inputs": {
                                "DICT": {
                                  "block": {
                                    "type": "variables_get",
                                    "id": "I.5Dp1Jse4bhHcBh8aKy",
                                    "fields": {
                                      "VAR": {
                                        "id": "y,xzi=8z}mnKzt7iqg1!"
                                      }
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "grades",
          "id": "y,xzi=8z}mnKzt7iqg1!"
        },
        {
          "name": "item",
          "id": "sgWr19HE%*1/C*Pf_NEb"
        }
      ]
    },
    "pythonPreview": "grades = None\n\n\ngrades = {}\ngrades['Ana'] = 90\ngrades['Ben'] = 85\nprint(list(grades.keys()))",
    "goal": "List out just the student names from a grade book.",
    "role": "The Get Keys/Values/Items block extracts exactly what you ask for.",
    "interaction": "It takes the grades dictionary as input with 'keys' selected, producing a plain list that Print then displays."
  },
  "tuple_create": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "text_print",
            "id": "AdTk;;cVIk[QVy67#(v$",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "tuple_create",
                  "id": "js2M*g]aT-+}?a%m3nCk",
                  "inputs": {
                    "A": {
                      "block": {
                        "type": "math_number",
                        "id": "9S|aM8,g[L]:,VFxSr_T",
                        "fields": {
                          "NUM": 10.5
                        }
                      }
                    },
                    "B": {
                      "block": {
                        "type": "math_number",
                        "id": "n}H|;|{2W|TrzRWl3oSC",
                        "fields": {
                          "NUM": 20.2
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "print((10.5, 20.2))",
    "goal": "Store a fixed (x, y) coordinate pair that should never change.",
    "role": "The Create Tuple block builds the immutable pair.",
    "interaction": "It takes two numbers as its A and B inputs and produces one unchangeable tuple for Print."
  },
  "set_create_empty": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "g#ZA%)#9M`Vjr2;ta8!I",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": ",1S=VA(Xu1v-+:o-Y[ag"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "set_create_empty",
                  "id": "H1aSK#8aEaq!R$HLGY[Z"
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "|RK$14m~=l2}I$P$X/Qn",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "variables_get",
                      "id": "*j{Tr(DAi}Frx:5Prqy)",
                      "fields": {
                        "VAR": {
                          "id": ",1S=VA(Xu1v-+:o-Y[ag"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "seen",
          "id": ",1S=VA(Xu1v-+:o-Y[ag"
        },
        {
          "name": "item",
          "id": "^dN[X2Z7?Yw;R{;l9qM@"
        }
      ]
    },
    "pythonPreview": "seen = None\n\n\nseen = set()\nprint(seen)",
    "goal": "Start tracking unique visitor IDs with nothing recorded yet.",
    "role": "The Create Empty Set block gives you a blank set to build on.",
    "interaction": "Its empty result is stored in the seen variable, ready to have IDs added to it."
  },
  "set_from_list": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "IhCZH*DAYM,xB_%/)@P5",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "1W9C_DD$Pc_i2B~Xx.)`"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "Nh$9GBC,L}Oykc.%ahZy",
                  "extraState": {
                    "itemCount": 4
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "Y.#iB^mmz{DJ4NL{!9*v",
                        "fields": {
                          "TEXT": "cat"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "Ts348e$0Gs[$bV?_kG;9",
                        "fields": {
                          "TEXT": "dog"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "5-.`Pd2U:*RQz1?DiLg}",
                        "fields": {
                          "TEXT": "cat"
                        }
                      }
                    },
                    "ADD3": {
                      "block": {
                        "type": "text",
                        "id": "J6aoCo{qQW|kWRtCYp:s",
                        "fields": {
                          "TEXT": "bird"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "wLWEIcZ^vfdVDHGJ2]D/",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "set_from_list",
                      "id": "[[L,`xFa%r(MBf$Qb=Dh",
                      "inputs": {
                        "LIST": {
                          "block": {
                            "type": "variables_get",
                            "id": "llt,`tU9ReS}7)v_Axp:",
                            "fields": {
                              "VAR": {
                                "id": "1W9C_DD$Pc_i2B~Xx.)`"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "entries",
          "id": "1W9C_DD$Pc_i2B~Xx.)`"
        },
        {
          "name": "item",
          "id": "Z1cciMCg7ju652V]ykK~"
        }
      ]
    },
    "pythonPreview": "entries = None\n\n\nentries = ['cat', 'dog', 'cat', 'bird']\nprint(set(entries))",
    "goal": "Remove duplicate entries from a list automatically.",
    "role": "The List To Set block performs the deduplication.",
    "interaction": "It takes the entries list (with a repeated 'cat') as input and produces a set with duplicates already gone."
  },
  "set_add": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "x3Pek8+|dm`zW}o-D*Vg",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "NOY/tgMsaK=9,.ysXw@B"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "set_create_empty",
                  "id": "77BLru,H=,Oxqmp^ub(|"
                }
              }
            },
            "next": {
              "block": {
                "type": "set_add",
                "id": "_bOrkxA{Bh(cw{Z0[{]*",
                "inputs": {
                  "ITEM": {
                    "block": {
                      "type": "text",
                      "id": "ByS7y3irtPQ=}O6aQ+C2",
                      "fields": {
                        "TEXT": "user_42"
                      }
                    }
                  },
                  "SET": {
                    "block": {
                      "type": "variables_get",
                      "id": "n+/jg--ASo?l:~3Ph|Fp",
                      "fields": {
                        "VAR": {
                          "id": "NOY/tgMsaK=9,.ysXw@B"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "XrRjz?cY#)}fsA*v9zv:",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "!t6].MKB2mCnIo+lsR|m",
                          "fields": {
                            "VAR": {
                              "id": "NOY/tgMsaK=9,.ysXw@B"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "seen",
          "id": "NOY/tgMsaK=9,.ysXw@B"
        },
        {
          "name": "item",
          "id": "PPBW:.K17gWOS2|DLtBx"
        }
      ]
    },
    "pythonPreview": "seen = None\n\n\nseen = set()\nseen.add('user_42')\nprint(seen)",
    "goal": "Record that a specific user has been seen before.",
    "role": "The Add To Set block records the new entry.",
    "interaction": "It takes the user ID and the seen set as inputs, adding the ID directly into seen."
  },
  "set_remove": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "M$s3~nQQ:Ovh,keRGCPB",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "Teu%2Dj)ua5D;ev-7B8o"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "set_from_list",
                  "id": "a{:=U/YVT!HCqCp*}x!z",
                  "inputs": {
                    "LIST": {
                      "block": {
                        "type": "lists_create_with",
                        "id": "68WeTu_}^-^+_$|t~5~2",
                        "extraState": {
                          "itemCount": 2
                        },
                        "inputs": {
                          "ADD0": {
                            "block": {
                              "type": "text",
                              "id": "C%H|MTuq,c?i5)E0sPhm",
                              "fields": {
                                "TEXT": "ana"
                              }
                            }
                          },
                          "ADD1": {
                            "block": {
                              "type": "text",
                              "id": "ukDx#QW$)2xWfZPfe;qX",
                              "fields": {
                                "TEXT": "ben"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "set_remove",
                "id": "e+ZzsHcjYTb5[/aOJOk=",
                "inputs": {
                  "ITEM": {
                    "block": {
                      "type": "text",
                      "id": "f6CFXM^yUe[+U=ABkQnU",
                      "fields": {
                        "TEXT": "ana"
                      }
                    }
                  },
                  "SET": {
                    "block": {
                      "type": "variables_get",
                      "id": "NX_oR{g|k;M!-5Xac!mD",
                      "fields": {
                        "VAR": {
                          "id": "Teu%2Dj)ua5D;ev-7B8o"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "m,tu{ROKrD5dYGIxBuM`",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "z65cb^JLI.XYk0;~fC#S",
                          "fields": {
                            "VAR": {
                              "id": "Teu%2Dj)ua5D;ev-7B8o"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "online",
          "id": "Teu%2Dj)ua5D;ev-7B8o"
        },
        {
          "name": "item",
          "id": "=R|s!UTn95]z1ers+EFo"
        }
      ]
    },
    "pythonPreview": "online = None\n\n\nonline = set(['ana', 'ben'])\nonline.remove('ana')\nprint(online)",
    "goal": "Mark a user as offline by removing them from an online-users set.",
    "role": "The Remove From Set block deletes that entry.",
    "interaction": "It takes the username and the online set as inputs, removing that entry directly."
  },
  "set_operations": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "GClVi1AX{,AE{(_o7O~l",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "O[^FVWF4^f?qUPI52#6K"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "set_from_list",
                  "id": "ciSN;)!Eb=$,{HHBe]V%",
                  "inputs": {
                    "LIST": {
                      "block": {
                        "type": "lists_create_with",
                        "id": "gX_^_[pl*u{u8vz!u[;y",
                        "extraState": {
                          "itemCount": 3
                        },
                        "inputs": {
                          "ADD0": {
                            "block": {
                              "type": "text",
                              "id": "feKMUqz]:;W0Ndt3,Ht(",
                              "fields": {
                                "TEXT": "Ana"
                              }
                            }
                          },
                          "ADD1": {
                            "block": {
                              "type": "text",
                              "id": "TRPHz%[;pA~#%uF:NreU",
                              "fields": {
                                "TEXT": "Ben"
                              }
                            }
                          },
                          "ADD2": {
                            "block": {
                              "type": "text",
                              "id": "(Q0`}(Sxsya`(Pl*Ql|R",
                              "fields": {
                                "TEXT": "Cid"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "variables_set",
                "id": "k)_X2LQt3CTgRuk-+.B!",
                "fields": {
                  "VAR": {
                    "id": "*6K3=YzrNZ`G8mZ;pI9J"
                  }
                },
                "inputs": {
                  "VALUE": {
                    "block": {
                      "type": "set_from_list",
                      "id": "88b;OB-)Es^Bd_rnRfo/",
                      "inputs": {
                        "LIST": {
                          "block": {
                            "type": "lists_create_with",
                            "id": "GiT32YYuqK`JNG%D!j16",
                            "extraState": {
                              "itemCount": 2
                            },
                            "inputs": {
                              "ADD0": {
                                "block": {
                                  "type": "text",
                                  "id": "y5VKA[LVwy_mcD6srOs0",
                                  "fields": {
                                    "TEXT": "Ben"
                                  }
                                }
                              },
                              "ADD1": {
                                "block": {
                                  "type": "text",
                                  "id": "NA~umfu/Q^tvSg4,%~}F",
                                  "fields": {
                                    "TEXT": "Dan"
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "XZD}H^dd7vZ[YV+^|-)_",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "set_operations",
                          "id": "%Z1ZHXq^FokdD/oiB@We",
                          "fields": {
                            "OP": "INTERSECTION"
                          },
                          "inputs": {
                            "SET1": {
                              "block": {
                                "type": "variables_get",
                                "id": "#W`Gw{-CwyYD%K2Ot617",
                                "fields": {
                                  "VAR": {
                                    "id": "O[^FVWF4^f?qUPI52#6K"
                                  }
                                }
                              }
                            },
                            "SET2": {
                              "block": {
                                "type": "variables_get",
                                "id": "VrB6mgya!djl2LhFJt+L",
                                "fields": {
                                  "VAR": {
                                    "id": "*6K3=YzrNZ`G8mZ;pI9J"
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "classA",
          "id": "O[^FVWF4^f?qUPI52#6K"
        },
        {
          "name": "classB",
          "id": "*6K3=YzrNZ`G8mZ;pI9J"
        },
        {
          "name": "item",
          "id": "K.]v(p57s^`I=DoYM$Op"
        }
      ]
    },
    "pythonPreview": "classA = None\nclassB = None\n\n\nclassA = set(['Ana', 'Ben', 'Cid'])\nclassB = set(['Ben', 'Dan'])\nprint(classA.intersection(classB))",
    "goal": "Find which students are enrolled in both of two classes.",
    "role": "The Set Union/Intersection/Difference block performs the comparison.",
    "interaction": "It takes classA and classB as its two inputs, with Intersection selected, and prints just the students in both."
  },
  "stack_push": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "H?i).#HP3QkMl%k;ZXN)",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "|v|}NL0+3$woms%+bjMK"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "y{L8YIEXoaa7[5g;XS,8",
                  "extraState": {
                    "itemCount": 0
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "stack_push",
                "id": "-4J,qUek_@W:xg55H(rn",
                "inputs": {
                  "ITEM": {
                    "block": {
                      "type": "text",
                      "id": "(1tib(){^M{EgYN.mCo@",
                      "fields": {
                        "TEXT": "typed a letter"
                      }
                    }
                  },
                  "STACK": {
                    "block": {
                      "type": "variables_get",
                      "id": "Qrt~(P$?/EDIV%U,9;)j",
                      "fields": {
                        "VAR": {
                          "id": "|v|}NL0+3$woms%+bjMK"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "stack_push",
                    "id": "5`BP^Ss6:E`8hh;nWT%w",
                    "inputs": {
                      "ITEM": {
                        "block": {
                          "type": "text",
                          "id": "V.F-e`?jd+M+?S!#$0Dj",
                          "fields": {
                            "TEXT": "made it bold"
                          }
                        }
                      },
                      "STACK": {
                        "block": {
                          "type": "variables_get",
                          "id": "qr7:()=RLYhI6j-].IQj",
                          "fields": {
                            "VAR": {
                              "id": "|v|}NL0+3$woms%+bjMK"
                            }
                          }
                        }
                      }
                    },
                    "next": {
                      "block": {
                        "type": "text_print",
                        "id": "ed)kDeg:NAFA+VQILiMT",
                        "inputs": {
                          "TEXT": {
                            "block": {
                              "type": "variables_get",
                              "id": "J~-WNu4#NKkm30,^YpZ2",
                              "fields": {
                                "VAR": {
                                  "id": "|v|}NL0+3$woms%+bjMK"
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "undo_stack",
          "id": "|v|}NL0+3$woms%+bjMK"
        },
        {
          "name": "item",
          "id": "Qy6B!Wb?bm[opkxHTT@K"
        }
      ]
    },
    "pythonPreview": "undo_stack = None\n\n\nundo_stack = []\nundo_stack.append('typed a letter')\nundo_stack.append('made it bold')\nprint(undo_stack)",
    "goal": "Track a sequence of editing actions for an undo feature.",
    "role": "The Push To Stack block adds each new action on top.",
    "interaction": "It's used twice in a row, each time adding one more action to the top of the undo_stack list."
  },
  "stack_pop": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "`nbfN6eXC8mJ7qsJb=Gi",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "T20!#`OTmCh:A};(-Nil"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": ";yVpdTxfGJe+-%.oxFn9",
                  "extraState": {
                    "itemCount": 2
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": ";oiy*BXc2al+5hmJ0)d+",
                        "fields": {
                          "TEXT": "typed a letter"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "!XD]^+x,U8`7GC[EbHBV",
                        "fields": {
                          "TEXT": "made it bold"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "variables_set",
                "id": "|rS)Bj]O-:dkn/oJ_4Ai",
                "fields": {
                  "VAR": {
                    "id": "]]2.[`#-tC%Rsf3Cs(}%"
                  }
                },
                "inputs": {
                  "VALUE": {
                    "block": {
                      "type": "stack_pop",
                      "id": ")r.!6@uNx%2sbAzB2aNR",
                      "inputs": {
                        "STACK": {
                          "block": {
                            "type": "variables_get",
                            "id": "bNhGF2]d|oISd[E$]N*~",
                            "fields": {
                              "VAR": {
                                "id": "T20!#`OTmCh:A};(-Nil"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "PujvV]C:nwiDHq$K0gnJ",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "text_join",
                          "id": "[0zLRamg.s/_Gt@YdaRz",
                          "extraState": {
                            "itemCount": 2
                          },
                          "inputs": {
                            "ADD0": {
                              "block": {
                                "type": "text",
                                "id": "A_uD[+c(AY/Sb6jKrITo",
                                "fields": {
                                  "TEXT": "Undoing: "
                                }
                              }
                            },
                            "ADD1": {
                              "block": {
                                "type": "variables_get",
                                "id": "7F(`_BSE}#_}gDrz9bwD",
                                "fields": {
                                  "VAR": {
                                    "id": "]]2.[`#-tC%Rsf3Cs(}%"
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "undo_stack",
          "id": "T20!#`OTmCh:A};(-Nil"
        },
        {
          "name": "last_action",
          "id": "]]2.[`#-tC%Rsf3Cs(}%"
        },
        {
          "name": "item",
          "id": "hUUfPHX(sY0f~[F5G$;6"
        }
      ]
    },
    "pythonPreview": "undo_stack = None\nlast_action = None\n\n\nundo_stack = ['typed a letter', 'made it bold']\nlast_action = undo_stack.pop()\nprint(f\"Undoing: {last_action}\")",
    "goal": "Undo the most recent editing action.",
    "role": "The Pop From Stack block removes and returns the most recent item.",
    "interaction": "It takes the undo_stack list as input, removes its top item, and stores it in last_action for a printed message."
  },
  "stack_pop_statement": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "ncG2%KzrYXN9?{lPgW.C",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "~ZK_]o/d.2pLM@mtlytd"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "y+J^)O*`y6T3-}9n]_*d",
                  "extraState": {
                    "itemCount": 3
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "tIl|m)?kvCcwf^OA+4BZ",
                        "fields": {
                          "TEXT": "page1"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "LE3p$T-@[;A8~]95Pw4y",
                        "fields": {
                          "TEXT": "page2"
                        }
                      }
                    },
                    "ADD2": {
                      "block": {
                        "type": "text",
                        "id": "nI|v`+ixGleh[]hC#C7.",
                        "fields": {
                          "TEXT": "page3"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "stack_pop_statement",
                "id": "r*P5:dGf3#$oQ35UH8bV",
                "inputs": {
                  "STACK": {
                    "block": {
                      "type": "variables_get",
                      "id": "GfY$Ijb38pUo2BH8S8$k",
                      "fields": {
                        "VAR": {
                          "id": "~ZK_]o/d.2pLM@mtlytd"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "vWq0/P|SjRlviunuSaLr",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "63V_Y:xsPU%a|nSb.ieg",
                          "fields": {
                            "VAR": {
                              "id": "~ZK_]o/d.2pLM@mtlytd"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "history",
          "id": "~ZK_]o/d.2pLM@mtlytd"
        },
        {
          "name": "item",
          "id": "`hoTdTX6?R,_+,x2oDxI"
        }
      ]
    },
    "pythonPreview": "history = None\n\n\nhistory = ['page1', 'page2', 'page3']\nhistory.pop()\nprint(history)",
    "goal": "Discard the most recently visited page from a browsing history stack.",
    "role": "The Pop From Stack (Discard) block removes the top item without keeping it.",
    "interaction": "It takes the history list as input and shrinks it by one, with nothing captured afterward."
  },
  "stack_peek": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "fNQ,pu.xxf93]I*Q(*x`",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "}Q]CGN^H4~(s`h}=uUMz"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "*R-mPB`8U$O}PiEq17X3",
                  "extraState": {
                    "itemCount": 2
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": ")[~^jDrYBvg9xTlD-aIH",
                        "fields": {
                          "TEXT": "typed a letter"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "J5IQn]x#wS8ik0.1L3%M",
                        "fields": {
                          "TEXT": "made it bold"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "qS8=3AXM_GWKx$nk7_=E",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "stack_peek",
                      "id": "~,j*)tV!8Yi/frF8^FMs",
                      "inputs": {
                        "STACK": {
                          "block": {
                            "type": "variables_get",
                            "id": "H`NI_M,F_;`P2vv|gEn7",
                            "fields": {
                              "VAR": {
                                "id": "}Q]CGN^H4~(s`h}=uUMz"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "undo_stack",
          "id": "}Q]CGN^H4~(s`h}=uUMz"
        },
        {
          "name": "item",
          "id": ":lSaymfWCFPO]ZxY4Z*H"
        }
      ]
    },
    "pythonPreview": "undo_stack = None\n\n\nundo_stack = ['typed a letter', 'made it bold']\nprint(undo_stack[-1])",
    "goal": "Check what the most recent undo action would be, without undoing it yet.",
    "role": "The Peek Top Of Stack block looks without removing.",
    "interaction": "It takes the undo_stack list as input and passes just its top item to Print, leaving the stack unchanged."
  },
  "queue_enqueue": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "WTOV8r#*rlUBP1+=0znO",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "e752tYc|uERqR5K@2~!b"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "IHY}g)=(cl7!xC:JmQ$E",
                  "extraState": {
                    "itemCount": 0
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "queue_enqueue",
                "id": "EwT/r%,qNhH./uYFNn!E",
                "inputs": {
                  "ITEM": {
                    "block": {
                      "type": "text",
                      "id": "EWhWaxwbwO6uwe^LzB6I",
                      "fields": {
                        "TEXT": "Customer A"
                      }
                    }
                  },
                  "QUEUE": {
                    "block": {
                      "type": "variables_get",
                      "id": "?|ExwA/}7Xfzh,KlihsX",
                      "fields": {
                        "VAR": {
                          "id": "e752tYc|uERqR5K@2~!b"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "queue_enqueue",
                    "id": "?#$7g0;aL(]oT%v]Rm6N",
                    "inputs": {
                      "ITEM": {
                        "block": {
                          "type": "text",
                          "id": "Sp9*cB+FwD0;#;XKz:DV",
                          "fields": {
                            "TEXT": "Customer B"
                          }
                        }
                      },
                      "QUEUE": {
                        "block": {
                          "type": "variables_get",
                          "id": "|@%o}#yRIAd,1UNC{5rZ",
                          "fields": {
                            "VAR": {
                              "id": "e752tYc|uERqR5K@2~!b"
                            }
                          }
                        }
                      }
                    },
                    "next": {
                      "block": {
                        "type": "text_print",
                        "id": "/9M:V5_{7mGR]yrxw)1/",
                        "inputs": {
                          "TEXT": {
                            "block": {
                              "type": "variables_get",
                              "id": "!1pUtRr]?B?g?AjGnzMB",
                              "fields": {
                                "VAR": {
                                  "id": "e752tYc|uERqR5K@2~!b"
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "line",
          "id": "e752tYc|uERqR5K@2~!b"
        },
        {
          "name": "item",
          "id": "NUj*{AdkwiNhTRMc!2=f"
        }
      ]
    },
    "pythonPreview": "line = None\n\n\nline = []\nline.append('Customer A')\nline.append('Customer B')\nprint(line)",
    "goal": "Add two customers to the back of a waiting line.",
    "role": "The Enqueue To Queue block adds each customer to the back.",
    "interaction": "It's used twice in a row, each time adding one more customer to the end of the line list."
  },
  "queue_dequeue": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "`~EGI:v2=V]|V`o1LY+m",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "^tNGt)[kvMPPhMa6YEeh"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "1)B/G~/5*LN/]cmNk8FK",
                  "extraState": {
                    "itemCount": 2
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "BX^SAk2jP)Smm.dEnI~h",
                        "fields": {
                          "TEXT": "Customer A"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "v@WvNVFr}NEb0RWeCU9g",
                        "fields": {
                          "TEXT": "Customer B"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "variables_set",
                "id": "Vw6BVg=+zC`8G)2T.h?|",
                "fields": {
                  "VAR": {
                    "id": "+m1u:0Ah!@p7+Z;tMVVw"
                  }
                },
                "inputs": {
                  "VALUE": {
                    "block": {
                      "type": "queue_dequeue",
                      "id": "l{3YaoCbwl;-$U/epatS",
                      "inputs": {
                        "QUEUE": {
                          "block": {
                            "type": "variables_get",
                            "id": "!j`.b%.2?TF_(vG{6Mg0",
                            "fields": {
                              "VAR": {
                                "id": "^tNGt)[kvMPPhMa6YEeh"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "[~o7wk=WnRJ%s}2zQ$(_",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "text_join",
                          "id": ",onY0an`*i|Lt?4`0$.i",
                          "extraState": {
                            "itemCount": 2
                          },
                          "inputs": {
                            "ADD0": {
                              "block": {
                                "type": "text",
                                "id": "g2vEFFB//Mv3t,}dVMiE",
                                "fields": {
                                  "TEXT": "Now serving: "
                                }
                              }
                            },
                            "ADD1": {
                              "block": {
                                "type": "variables_get",
                                "id": "?!4;*n.Frw})Lu+M,_#M",
                                "fields": {
                                  "VAR": {
                                    "id": "+m1u:0Ah!@p7+Z;tMVVw"
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "line",
          "id": "^tNGt)[kvMPPhMa6YEeh"
        },
        {
          "name": "next_up",
          "id": "+m1u:0Ah!@p7+Z;tMVVw"
        },
        {
          "name": "item",
          "id": "zW6v#|yxRgW9k#@LGFO3"
        }
      ]
    },
    "pythonPreview": "line = None\nnext_up = None\n\n\nline = ['Customer A', 'Customer B']\nnext_up = line.pop(0)\nprint(f\"Now serving: {next_up}\")",
    "goal": "Serve the next customer who has been waiting the longest.",
    "role": "The Dequeue From Queue block removes and returns whoever is at the front.",
    "interaction": "It takes the line list as input, removes its front item, and stores it in next_up for a printed message."
  },
  "queue_dequeue_statement": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "}R_Q!YV77MUOG$9~}1u1",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "OCbV|/~5U2H5Y6sh[W:k"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "7]itRIly9)FigFP+P~`y",
                  "extraState": {
                    "itemCount": 2
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "}EGU-J@!M3zR4u[?q2TM",
                        "fields": {
                          "TEXT": "Customer A"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "H(jv0(cQVKXN9TJF/.s!",
                        "fields": {
                          "TEXT": "Customer B"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "queue_dequeue_statement",
                "id": "iu%_8W_q=~??%-G}/9:W",
                "inputs": {
                  "QUEUE": {
                    "block": {
                      "type": "variables_get",
                      "id": "]s:jZG_Z)qsB21$bS{E1",
                      "fields": {
                        "VAR": {
                          "id": "OCbV|/~5U2H5Y6sh[W:k"
                        }
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "O+WXRAaN-J)RM25@=kT`",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "variables_get",
                          "id": "{??,x`,sy-3KUB@i/Q)d",
                          "fields": {
                            "VAR": {
                              "id": "OCbV|/~5U2H5Y6sh[W:k"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "line",
          "id": "OCbV|/~5U2H5Y6sh[W:k"
        },
        {
          "name": "item",
          "id": ".pJBc7-+ZNo}9}j5UP$g"
        }
      ]
    },
    "pythonPreview": "line = None\n\n\nline = ['Customer A', 'Customer B']\nline.pop(0)\nprint(line)",
    "goal": "Remove the front customer from the line without needing their name.",
    "role": "The Dequeue From Queue (Discard) block removes the front item without keeping it.",
    "interaction": "It takes the line list as input and shrinks it by one, with nothing captured afterward."
  },
  "queue_peek": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "SO.q#nm+_dT59~FgZ#_5",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": ".!D)asRF40i+*M%jt4-V"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "lists_create_with",
                  "id": "`}tPbLdkT$Fnk+cunLR1",
                  "extraState": {
                    "itemCount": 2
                  },
                  "inputs": {
                    "ADD0": {
                      "block": {
                        "type": "text",
                        "id": "}6`U27^4h}E2KY@`zhUh",
                        "fields": {
                          "TEXT": "Customer A"
                        }
                      }
                    },
                    "ADD1": {
                      "block": {
                        "type": "text",
                        "id": "6?f]sSmobO2yZXp}T|%U",
                        "fields": {
                          "TEXT": "Customer B"
                        }
                      }
                    }
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": ",J!_eWp4g5*=/om{RO}T",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "queue_peek",
                      "id": "O~8.*}UcaOyIl/On7/$a",
                      "inputs": {
                        "QUEUE": {
                          "block": {
                            "type": "variables_get",
                            "id": "LQ5VDaGMinI40LUeL:]u",
                            "fields": {
                              "VAR": {
                                "id": ".!D)asRF40i+*M%jt4-V"
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "line",
          "id": ".!D)asRF40i+*M%jt4-V"
        },
        {
          "name": "item",
          "id": "tU$cRIUEHuHmhtk|qCl7"
        }
      ]
    },
    "pythonPreview": "line = None\n\n\nline = ['Customer A', 'Customer B']\nprint(line[0])",
    "goal": "Check who's next in line without actually serving them yet.",
    "role": "The Peek Front Of Queue block looks without removing.",
    "interaction": "It takes the line list as input and passes just its front item to Print, leaving the queue unchanged."
  },
  "variables_get": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "3c-/Vi^jef;djac4uZ-!",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "~8dwo710Z+Qwpvjl.],,"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "text",
                  "id": "0!FY4W!vN;,|dCpf[iy}",
                  "fields": {
                    "TEXT": "Hello there!"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "p9U.+32~P*{L9?%Q{Q/6",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "variables_get",
                      "id": "_-9q8+VJHb!u?q8!_YR8",
                      "fields": {
                        "VAR": {
                          "id": "~8dwo710Z+Qwpvjl.],,"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "greeting",
          "id": "~8dwo710Z+Qwpvjl.],,"
        },
        {
          "name": "item",
          "id": "N:J-F@~ZX~zr%wjmy.D)"
        }
      ]
    },
    "pythonPreview": "greeting = None\n\n\ngreeting = 'Hello there!'\nprint(greeting)",
    "goal": "Display a greeting that was stored earlier in a variable.",
    "role": "The Get Variable block retrieves the stored value.",
    "interaction": "It reads whatever value is currently stored in greeting and hands it to Print."
  },
  "variables_set": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "?C9lM0j=)E`x9)x0QsDN",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "BO?,d-p)_`Rk[V~{mflt"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "Dpi4+pzun5ck4a(.W~]V",
                  "fields": {
                    "NUM": 0
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "%H5aVZA(c7mU8-)q44A#",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "variables_get",
                      "id": "YE3o,g]Hjw0Wd_]xWICG",
                      "fields": {
                        "VAR": {
                          "id": "BO?,d-p)_`Rk[V~{mflt"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "high_score",
          "id": "BO?,d-p)_`Rk[V~{mflt"
        },
        {
          "name": "item",
          "id": "Jh3.l^l6.EW[SnNEI5i|"
        }
      ]
    },
    "pythonPreview": "high_score = None\n\n\nhigh_score = 0\nprint(high_score)",
    "goal": "Start tracking a game's high score at zero.",
    "role": "The Set Variable block stores the starting value.",
    "interaction": "It stores the number 0 into high_score, which Print then displays."
  },
  "variable_swap": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "YGUwL#^*Df(l)CdlZ!BU",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "ALk,K@a$/Xc.sLG-B!;["
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "YaMSFZ%?fTChK7%Xq7uo",
                  "fields": {
                    "NUM": 5
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "variables_set",
                "id": "u9rt0`,esFajrC{CVmrC",
                "fields": {
                  "VAR": {
                    "id": "x_bP5HNK|9A;?@[m%yyF"
                  }
                },
                "inputs": {
                  "VALUE": {
                    "block": {
                      "type": "math_number",
                      "id": "}7Xsx;cJ?hDp/FGn|I54",
                      "fields": {
                        "NUM": 10
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "variable_swap",
                    "id": "NdqM?hoxbv]rrTa2Qbj~",
                    "fields": {
                      "VAR1": {
                        "id": "ALk,K@a$/Xc.sLG-B!;["
                      },
                      "VAR2": {
                        "id": "x_bP5HNK|9A;?@[m%yyF"
                      }
                    },
                    "next": {
                      "block": {
                        "type": "text_print",
                        "id": "9x!prns.bdGNDEA@^b5=",
                        "inputs": {
                          "TEXT": {
                            "block": {
                              "type": "variables_get",
                              "id": ":J]%NP751]hE%vEvupBy",
                              "fields": {
                                "VAR": {
                                  "id": "ALk,K@a$/Xc.sLG-B!;["
                                }
                              }
                            }
                          }
                        },
                        "next": {
                          "block": {
                            "type": "text_print",
                            "id": "sBSYkWN=|_PsnR(ZoFfp",
                            "inputs": {
                              "TEXT": {
                                "block": {
                                  "type": "variables_get",
                                  "id": "ONBxs7|*2wl:z[/#t]#f",
                                  "fields": {
                                    "VAR": {
                                      "id": "x_bP5HNK|9A;?@[m%yyF"
                                    }
                                  }
                                }
                              }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "a",
          "id": "ALk,K@a$/Xc.sLG-B!;["
        },
        {
          "name": "b",
          "id": "x_bP5HNK|9A;?@[m%yyF"
        },
        {
          "name": "item",
          "id": "snY#OLSJ?`6B:Oa,%|i8"
        }
      ]
    },
    "pythonPreview": "a = None\nb = None\n\n\na = 5\nb = 10\na, b = b, a\nprint(a)\nprint(b)",
    "goal": "Trade the values of two variables without a temporary third one.",
    "role": "The Swap Two Variables block does the exchange in one step.",
    "interaction": "It takes variables a and b directly (by name) and swaps their stored values; printing them afterward shows they've traded places."
  },
  "procedures_defnoreturn": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "procedures_defnoreturn",
            "id": "#d6+/w_{nhidgsG*=5{/",
            "x": 0,
            "y": 0,
            "fields": {
              "NAME": "print_divider"
            },
            "inputs": {
              "STACK": {
                "block": {
                  "type": "text_print",
                  "id": "NJK2(6.4V8kk!7aqL,{g",
                  "inputs": {
                    "TEXT": {
                      "block": {
                        "type": "text",
                        "id": "86-6F[IhBrrTw(p`jvYH",
                        "fields": {
                          "TEXT": "------------------------"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          {
            "type": "procedures_callnoreturn",
            "id": "4;!C|(P`E)afiT]EW{sa",
            "x": 0,
            "y": 0,
            "extraState": {
              "name": "print_divider"
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "2mM98U1c{aWgRIaqA]Qb",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "text",
                      "id": "X!~sdWxk?U-5Z5}]|FOc",
                      "fields": {
                        "TEXT": "Section 1 content"
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "procedures_callnoreturn",
                    "id": "D61Wyr8yg8Ej!#um(2/A",
                    "extraState": {
                      "name": "print_divider"
                    }
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "def print_divider():\n  print('------------------------')\n\n\nprint_divider()\nprint('Section 1 content')\nprint_divider()",
    "goal": "Print a visual divider line, reusably, wherever it's needed.",
    "role": "The Define Function (No Return) block packages the divider-printing logic under one name.",
    "interaction": "Its body (a single Print block) only runs when a matching Call Function block is used elsewhere in the program."
  },
  "procedures_defreturn": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "procedures_defreturn",
            "id": "^Uo:3m8I)r`JP-Y/AOp*",
            "x": 0,
            "y": 0,
            "fields": {
              "NAME": "get_greeting"
            },
            "inputs": {
              "RETURN": {
                "block": {
                  "type": "text",
                  "id": "a8=S)-Q/[j;Ij`K!CZ|P",
                  "fields": {
                    "TEXT": "Hello, learner!"
                  }
                }
              }
            }
          },
          {
            "type": "variables_set",
            "id": "42V@VnpkwgO(1qV~#f^W",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": ";2y@~!_ygOngYQo:}u3Z"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "procedures_callreturn",
                  "id": "i$dxGLd}PDHTUj`KZ;e$",
                  "extraState": {
                    "name": "get_greeting"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "s6^R%t7n$6JLs(!yrL+F",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "variables_get",
                      "id": "OJBq5wLaVJU_.phhZ.a3",
                      "fields": {
                        "VAR": {
                          "id": ";2y@~!_ygOngYQo:}u3Z"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "message",
          "id": ";2y@~!_ygOngYQo:}u3Z"
        },
        {
          "name": "item",
          "id": "KL)(VTutrp*6*|Cfr^xB"
        }
      ]
    },
    "pythonPreview": "message = None\n\n\ndef get_greeting():\n  return 'Hello, learner!'\n\n\nmessage = get_greeting()\nprint(message)",
    "goal": "Build a reusable greeting that other parts of a program can ask for.",
    "role": "The Define Function (With Return) block packages the greeting logic and hands back a result.",
    "interaction": "Its Return slot supplies the text that gets sent back to whatever calls this function."
  },
  "procedures_callnoreturn": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "procedures_defnoreturn",
            "id": "$=qROoSA(55pl1C28#f^",
            "x": 0,
            "y": 0,
            "fields": {
              "NAME": "say_welcome"
            },
            "inputs": {
              "STACK": {
                "block": {
                  "type": "text_print",
                  "id": "`Xk.}$+^ohtXjy:7xv/a",
                  "inputs": {
                    "TEXT": {
                      "block": {
                        "type": "text",
                        "id": "Bx_1v2s*JF6F/nR,S2LO",
                        "fields": {
                          "TEXT": "Welcome to AlgoBlocks!"
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          {
            "type": "procedures_callnoreturn",
            "id": "-%Ei?zId%t7uu@K45OK^",
            "x": 0,
            "y": 0,
            "extraState": {
              "name": "say_welcome"
            }
          }
        ]
      }
    },
    "pythonPreview": "def say_welcome():\n  print('Welcome to AlgoBlocks!')\n\n\nsay_welcome()",
    "goal": "Actually run a previously defined 'welcome message' function.",
    "role": "The Call Function (No Return) block is what triggers the function to run.",
    "interaction": "It references the say_welcome function by name, causing its body (defined just above) to execute."
  },
  "procedures_callreturn": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "procedures_defreturn",
            "id": "[DXT8OBY|IdcUek0z_9u",
            "x": 0,
            "y": 0,
            "fields": {
              "NAME": "square_of_five"
            },
            "inputs": {
              "RETURN": {
                "block": {
                  "type": "math_arithmetic",
                  "id": "?;KYEyCAo?kIn-g4wL(R",
                  "fields": {
                    "OP": "MULTIPLY"
                  },
                  "inputs": {
                    "A": {
                      "block": {
                        "type": "math_number",
                        "id": "_,?14IU?hI=!.(1q7,R9",
                        "fields": {
                          "NUM": 5
                        }
                      }
                    },
                    "B": {
                      "block": {
                        "type": "math_number",
                        "id": "V]nHU:VyXwrHNpFlC2OA",
                        "fields": {
                          "NUM": 5
                        }
                      }
                    }
                  }
                }
              }
            }
          },
          {
            "type": "text_print",
            "id": "}i,n65/c.h2XYWtYj/`^",
            "x": 0,
            "y": 0,
            "inputs": {
              "TEXT": {
                "block": {
                  "type": "procedures_callreturn",
                  "id": "WRNB?!OIuL]b2EqJq@-+",
                  "extraState": {
                    "name": "square_of_five"
                  }
                }
              }
            }
          }
        ]
      }
    },
    "pythonPreview": "def square_of_five():\n  return 5 * 5\n\n\nprint(square_of_five())",
    "goal": "Use a reusable function to calculate 5 squared.",
    "role": "The Call Function (With Return) block runs the function and captures its answer.",
    "interaction": "It references the square_of_five function by name, and its returned value is plugged directly into Print."
  },
  "procedures_ifreturn": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "procedures_defreturn",
            "id": "L%UZ{4*lb#M3r`F}./!#",
            "x": 0,
            "y": 0,
            "fields": {
              "NAME": "classify_temp"
            },
            "inputs": {
              "STACK": {
                "block": {
                  "type": "variables_set",
                  "id": "0!O4Dp~$pDgUHe8kTJer",
                  "fields": {
                    "VAR": {
                      "id": "%a.=LtTD!nM_5SNF4m^o"
                    }
                  },
                  "inputs": {
                    "VALUE": {
                      "block": {
                        "type": "math_number",
                        "id": "nMQ5,fa7/rg?CTt/Byj*",
                        "fields": {
                          "NUM": -5
                        }
                      }
                    }
                  },
                  "next": {
                    "block": {
                      "type": "procedures_ifreturn",
                      "id": "_1wCvA$+SVir^hJz85?}",
                      "extraState": "<mutation value=\"1\"></mutation>",
                      "inputs": {
                        "CONDITION": {
                          "block": {
                            "type": "logic_compare",
                            "id": "U`.+Ib@+dc};(+`4U,z:",
                            "fields": {
                              "OP": "LT"
                            },
                            "inputs": {
                              "A": {
                                "block": {
                                  "type": "variables_get",
                                  "id": "H}NQP9u`9y.#wH^~hRFN",
                                  "fields": {
                                    "VAR": {
                                      "id": "%a.=LtTD!nM_5SNF4m^o"
                                    }
                                  }
                                }
                              },
                              "B": {
                                "block": {
                                  "type": "math_number",
                                  "id": "cvIF6H|KD)/q}{sE#nEC",
                                  "fields": {
                                    "NUM": 0
                                  }
                                }
                              }
                            }
                          }
                        },
                        "VALUE": {
                          "block": {
                            "type": "text",
                            "id": "7a=#^?#:N$.[$z+[Vhr2",
                            "fields": {
                              "TEXT": "freezing"
                            }
                          }
                        }
                      }
                    }
                  }
                }
              },
              "RETURN": {
                "block": {
                  "type": "text",
                  "id": "`(j2ossRsPD`Ki;,cI$u",
                  "fields": {
                    "TEXT": "above freezing"
                  }
                }
              }
            }
          },
          {
            "type": "variables_set",
            "id": "1NWrQOa=YWf+#s+JW:/=",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "Hl:*E!NV5_P#z~NgwF2*"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "procedures_callreturn",
                  "id": "2z}CEl[TcT^n[2p*7,gk",
                  "extraState": {
                    "name": "classify_temp"
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "text_print",
                "id": "Di@qb]f8x$X695Wk9i/8",
                "inputs": {
                  "TEXT": {
                    "block": {
                      "type": "variables_get",
                      "id": "yD/CB`11?8(Ba~La0mVM",
                      "fields": {
                        "VAR": {
                          "id": "Hl:*E!NV5_P#z~NgwF2*"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "temp",
          "id": "%a.=LtTD!nM_5SNF4m^o"
        },
        {
          "name": "result",
          "id": "Hl:*E!NV5_P#z~NgwF2*"
        },
        {
          "name": "item",
          "id": "bp?]pi)EBTEI`tJtu61k"
        }
      ]
    },
    "pythonPreview": "result = None\ntemp = None\n\n\ndef classify_temp():\n  temp = -5\n\n  if temp < 0:\n    return 'freezing'\n\n  return 'above freezing'\n\n\nresult = classify_temp()\nprint(result)",
    "goal": "Classify a temperature as freezing or not, exiting early when possible.",
    "role": "The Return If block lets the function end early with an answer as soon as it's found one.",
    "interaction": "It sits inside the function's body, checking the temp variable; if the condition is true, it returns immediately and skips the function's final Return block entirely."
  },
  "raw_python_statement": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "raw_python_statement",
            "id": "zCsF{EF9|Of#O{_G;e$X",
            "x": 0,
            "y": 0,
            "fields": {
              "CODE": "print('Hello from raw Python!')"
            }
          }
        ]
      }
    },
    "pythonPreview": "print('Hello from raw Python!')",
    "goal": "Run a line of hand-written Python that doesn't have a matching block yet.",
    "role": "The Raw Python Statement block injects that exact line directly into the program.",
    "interaction": "It stands alone \u2014 whatever text is typed into it becomes real Python, with no connection to other blocks needed."
  },
  "raw_python_expression": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "variables_set",
            "id": "b]6yCA]9lK0KD`ezz2)5",
            "x": 0,
            "y": 0,
            "fields": {
              "VAR": {
                "id": "LGNv!],2b|3rYbFL(tA/"
              }
            },
            "inputs": {
              "VALUE": {
                "block": {
                  "type": "math_number",
                  "id": "oXxxdSN7[mbK(4zLSsj6",
                  "fields": {
                    "NUM": 4
                  }
                }
              }
            },
            "next": {
              "block": {
                "type": "variables_set",
                "id": "o$d(kt*`kiH2?sld_KD*",
                "fields": {
                  "VAR": {
                    "id": "=iD`,W`q:)/DbjE%w.M0"
                  }
                },
                "inputs": {
                  "VALUE": {
                    "block": {
                      "type": "math_number",
                      "id": "uVy~au8oJaz{e}PX#]`5",
                      "fields": {
                        "NUM": 6
                      }
                    }
                  }
                },
                "next": {
                  "block": {
                    "type": "text_print",
                    "id": "Gt~=HIm;fMc^~Ns;(RF1",
                    "inputs": {
                      "TEXT": {
                        "block": {
                          "type": "raw_python_expression",
                          "id": "4GA@Gs5k,%R+}:va:Ix=",
                          "fields": {
                            "CODE": "x + y"
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      },
      "variables": [
        {
          "name": "x",
          "id": "LGNv!],2b|3rYbFL(tA/"
        },
        {
          "name": "y",
          "id": "=iD`,W`q:)/DbjE%w.M0"
        },
        {
          "name": "item",
          "id": ")=UwG7V5-){z{p.!i{GB"
        }
      ]
    },
    "pythonPreview": "x = None\ny = None\n\n\nx = 4\ny = 6\nprint(x + y)",
    "goal": "Add two numbers together using a hand-written Python expression.",
    "role": "The Raw Python Expression block evaluates the typed formula and produces a value.",
    "interaction": "Its result plugs into Print just like any other value block would, even though it was typed as raw code."
  },
  "raw_python_multiline": {
    "workspaceState": {
      "blocks": {
        "languageVersion": 0,
        "blocks": [
          {
            "type": "raw_python_multiline",
            "id": "VTs=v(R%Y~(|3Xce/dYH",
            "x": 0,
            "y": 0,
            "fields": {
              "CODE": "def custom_func():\n    print('Defined with raw Python')\n\ncustom_func()"
            }
          }
        ]
      }
    },
    "pythonPreview": "def custom_func():\n    print('Defined with raw Python')\n\ncustom_func()",
    "goal": "Define and immediately call a small custom function using raw Python.",
    "role": "The Raw Python Block injects several lines of hand-written code at once.",
    "interaction": "It stands alone in the program, containing both the function definition and the call to run it."
  }
};
