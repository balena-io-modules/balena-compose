/**
 * @license
 * Copyright 2018 Balena Ltd.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

export const sampleDaemonOutput = [
	{ status: 'Pulling from library/registry', id: '2' },
	{ status: 'Pulling fs layer', progressDetail: {}, id: 'd6a5679aa3cf' },
	{ status: 'Pulling fs layer', progressDetail: {}, id: 'ad0eac849f8f' },
	{ status: 'Pulling fs layer', progressDetail: {}, id: '2261ba058a15' },
	{ status: 'Pulling fs layer', progressDetail: {}, id: 'f296fda86f10' },
	{ status: 'Pulling fs layer', progressDetail: {}, id: 'bcd4a541795b' },
	{ status: 'Waiting', progressDetail: {}, id: 'bcd4a541795b' },
	{ status: 'Waiting', progressDetail: {}, id: 'f296fda86f10' },
	{
		status: 'Downloading',
		progressDetail: { current: 21176, total: 2034577 },
		progress:
			'[>                                                  ]  21.18kB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 25139, total: 2387846 },
		progress:
			'[>                                                  ]  25.14kB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 302398, total: 2034577 },
		progress:
			'[=======>                                           ]  302.4kB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 127035, total: 2387846 },
		progress:
			'[==>                                                ]    127kB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 63627, total: 6265380 },
		progress:
			'[>                                                  ]  63.63kB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 564542, total: 2034577 },
		progress:
			'[=============>                                     ]  564.5kB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 228504, total: 2387846 },
		progress:
			'[====>                                              ]  228.5kB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 192571, total: 6265380 },
		progress:
			'[=>                                                 ]  192.6kB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 817932, total: 2034577 },
		progress:
			'[====================>                              ]  817.9kB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 359164, total: 2387846 },
		progress:
			'[=======>                                           ]  359.2kB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 326808, total: 6265380 },
		progress:
			'[==>                                                ]  326.8kB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1014540, total: 2034577 },
		progress:
			'[========================>                          ]  1.015MB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 473852, total: 2387846 },
		progress:
			'[=========>                                         ]  473.9kB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 523416, total: 6265380 },
		progress:
			'[====>                                              ]  523.4kB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1178380, total: 2034577 },
		progress:
			'[============================>                      ]  1.178MB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 720024, total: 6265380 },
		progress:
			'[=====>                                             ]    720kB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 576252, total: 2387846 },
		progress:
			'[============>                                      ]  576.3kB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1342220, total: 2034577 },
		progress:
			'[================================>                  ]  1.342MB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 916240, total: 6265380 },
		progress:
			'[=======>                                           ]  916.2kB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 703228, total: 2387846 },
		progress:
			'[==============>                                    ]  703.2kB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1538828, total: 2034577 },
		progress:
			'[=====================================>             ]  1.539MB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 801532, total: 2387846 },
		progress:
			'[================>                                  ]  801.5kB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1141520, total: 6265380 },
		progress:
			'[=========>                                         ]  1.142MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1702668, total: 2034577 },
		progress:
			'[=========================================>         ]  1.703MB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 899836, total: 2387846 },
		progress:
			'[==================>                                ]  899.8kB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1833740, total: 2034577 },
		progress:
			'[=============================================>     ]  1.834MB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1350416, total: 6265380 },
		progress:
			'[==========>                                        ]   1.35MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 932604, total: 2387846 },
		progress:
			'[===================>                               ]  932.6kB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1932044, total: 2034577 },
		progress:
			'[===============================================>   ]  1.932MB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1555216, total: 6265380 },
		progress:
			'[============>                                      ]  1.555MB/6.265MB',
		id: '2261ba058a15',
	},
	{ status: 'Verifying Checksum', progressDetail: {}, id: 'ad0eac849f8f' },
	{ status: 'Download complete', progressDetail: {}, id: 'ad0eac849f8f' },
	{
		status: 'Downloading',
		progressDetail: { current: 1030908, total: 2387846 },
		progress:
			'[=====================>                             ]  1.031MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1817360, total: 6265380 },
		progress:
			'[==============>                                    ]  1.817MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1174268, total: 2387846 },
		progress:
			'[========================>                          ]  1.174MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 2087696, total: 6265380 },
		progress:
			'[================>                                  ]  2.088MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1293052, total: 2387846 },
		progress:
			'[===========================>                       ]  1.293MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 2370320, total: 6265380 },
		progress:
			'[==================>                                ]   2.37MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1424124, total: 2387846 },
		progress:
			'[=============================>                     ]  1.424MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 2702096, total: 6265380 },
		progress:
			'[=====================>                             ]  2.702MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1555196, total: 2387846 },
		progress:
			'[================================>                  ]  1.555MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 3029776, total: 6265380 },
		progress:
			'[========================>                          ]   3.03MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1678076, total: 2387846 },
		progress:
			'[===================================>               ]  1.678MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 369, total: 369 },
		progress:
			'[==================================================>]     369B/369B',
		id: 'f296fda86f10',
	},
	{ status: 'Verifying Checksum', progressDetail: {}, id: 'f296fda86f10' },
	{ status: 'Download complete', progressDetail: {}, id: 'f296fda86f10' },
	{
		status: 'Downloading',
		progressDetail: { current: 3357456, total: 6265380 },
		progress:
			'[==========================>                        ]  3.357MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1809148, total: 2387846 },
		progress:
			'[=====================================>             ]  1.809MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 3685136, total: 6265380 },
		progress:
			'[=============================>                     ]  3.685MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 1927932, total: 2387846 },
		progress:
			'[========================================>          ]  1.928MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 4012816, total: 6265380 },
		progress:
			'[================================>                  ]  4.013MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 2050812, total: 2387846 },
		progress:
			'[==========================================>        ]  2.051MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 4340496, total: 6265380 },
		progress:
			'[==================================>                ]   4.34MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 2181884, total: 2387846 },
		progress:
			'[=============================================>     ]  2.182MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 4668176, total: 6265380 },
		progress:
			'[=====================================>             ]  4.668MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 2312956, total: 2387846 },
		progress:
			'[================================================>  ]  2.313MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 212, total: 212 },
		progress:
			'[==================================================>]     212B/212B',
		id: 'bcd4a541795b',
	},
	{ status: 'Verifying Checksum', progressDetail: {}, id: 'bcd4a541795b' },
	{ status: 'Download complete', progressDetail: {}, id: 'bcd4a541795b' },
	{ status: 'Verifying Checksum', progressDetail: {}, id: 'd6a5679aa3cf' },
	{ status: 'Download complete', progressDetail: {}, id: 'd6a5679aa3cf' },
	{
		status: 'Extracting',
		progressDetail: { current: 32768, total: 2387846 },
		progress:
			'[>                                                  ]  32.77kB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 4995856, total: 6265380 },
		progress:
			'[=======================================>           ]  4.996MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Extracting',
		progressDetail: { current: 983040, total: 2387846 },
		progress:
			'[====================>                              ]    983kB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 5389072, total: 6265380 },
		progress:
			'[===========================================>       ]  5.389MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Extracting',
		progressDetail: { current: 2387846, total: 2387846 },
		progress:
			'[==================================================>]  2.388MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{
		status: 'Extracting',
		progressDetail: { current: 2387846, total: 2387846 },
		progress:
			'[==================================================>]  2.388MB/2.388MB',
		id: 'd6a5679aa3cf',
	},
	{ status: 'Pull complete', progressDetail: {}, id: 'd6a5679aa3cf' },
	{
		status: 'Extracting',
		progressDetail: { current: 32768, total: 2034577 },
		progress:
			'[>                                                  ]  32.77kB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 5782288, total: 6265380 },
		progress:
			'[==============================================>    ]  5.782MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Extracting',
		progressDetail: { current: 425984, total: 2034577 },
		progress:
			'[==========>                                        ]    426kB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 6241040, total: 6265380 },
		progress:
			'[=================================================> ]  6.241MB/6.265MB',
		id: '2261ba058a15',
	},
	{ status: 'Verifying Checksum', progressDetail: {}, id: '2261ba058a15' },
	{ status: 'Download complete', progressDetail: {}, id: '2261ba058a15' },
	{
		status: 'Extracting',
		progressDetail: { current: 1802240, total: 2034577 },
		progress:
			'[============================================>      ]  1.802MB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Extracting',
		progressDetail: { current: 1998848, total: 2034577 },
		progress:
			'[=================================================> ]  1.999MB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{
		status: 'Extracting',
		progressDetail: { current: 2034577, total: 2034577 },
		progress:
			'[==================================================>]  2.035MB/2.035MB',
		id: 'ad0eac849f8f',
	},
	{ status: 'Pull complete', progressDetail: {}, id: 'ad0eac849f8f' },
	{
		status: 'Extracting',
		progressDetail: { current: 65536, total: 6265380 },
		progress:
			'[>                                                  ]  65.54kB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Extracting',
		progressDetail: { current: 1703936, total: 6265380 },
		progress:
			'[=============>                                     ]  1.704MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Extracting',
		progressDetail: { current: 4194304, total: 6265380 },
		progress:
			'[=================================>                 ]  4.194MB/6.265MB',
		id: '2261ba058a15',
	},
	{
		status: 'Extracting',
		progressDetail: { current: 6265380, total: 6265380 },
		progress:
			'[==================================================>]  6.265MB/6.265MB',
		id: '2261ba058a15',
	},
	{ status: 'Pull complete', progressDetail: {}, id: '2261ba058a15' },
	{
		status: 'Extracting',
		progressDetail: { current: 369, total: 369 },
		progress:
			'[==================================================>]     369B/369B',
		id: 'f296fda86f10',
	},
	{
		status: 'Extracting',
		progressDetail: { current: 369, total: 369 },
		progress:
			'[==================================================>]     369B/369B',
		id: 'f296fda86f10',
	},
	{ status: 'Pull complete', progressDetail: {}, id: 'f296fda86f10' },
	{
		status: 'Extracting',
		progressDetail: { current: 212, total: 212 },
		progress:
			'[==================================================>]     212B/212B',
		id: 'bcd4a541795b',
	},
	{
		status: 'Extracting',
		progressDetail: { current: 212, total: 212 },
		progress:
			'[==================================================>]     212B/212B',
		id: 'bcd4a541795b',
	},
	{ status: 'Pull complete', progressDetail: {}, id: 'bcd4a541795b' },
	{
		status:
			'Digest: sha256:5a156ff125e5a12ac7fdec2b90b7e2ae5120fa249cf62248337b6d04abc574c8',
	},
	{ status: 'Status: Downloaded newer image for registry:2' },
	{ stream: ' ---> 2e2f252f3c88\n' },
	{ stream: 'Step 2/7 : EXPOSE 5000\n' },
	{ stream: ' ---> Running in 2730e2762325\n' },
	{ stream: ' ---> 74ca748fb0bd\n' },
	{ stream: 'Removing intermediate container 2730e2762325\n' },
	{ stream: 'Step 3/7 : ENV REGISTRY_AUTH htpasswd\n' },
	{ stream: ' ---> Running in 142609907c76\n' },
	{ stream: ' ---> 8026f484b574\n' },
	{ stream: 'Removing intermediate container 142609907c76\n' },
	{ stream: 'Step 4/7 : ENV REGISTRY_AUTH_HTPASSWD_REALM "Registry Realm"\n' },
	{ stream: ' ---> Running in 9e5eefb93fb5\n' },
	{ stream: ' ---> d2fc9618c8f0\n' },
	{ stream: 'Removing intermediate container 9e5eefb93fb5\n' },
	{ stream: 'Step 5/7 : ENV REGISTRY_AUTH_HTPASSWD_PATH "/auth/htpasswd"\n' },
	{ stream: ' ---> Running in fdd5d1300343\n' },
	{ stream: ' ---> 0a0cc5883428\n' },
	{ stream: 'Removing intermediate container fdd5d1300343\n' },
	{ stream: 'Step 6/7 : RUN /bin/mkdir -p /auth\n' },
	{ stream: ' ---> Running in 0b4930768efb\n' },
	{ stream: ' ---> 783ea685636d\n' },
	{ stream: 'Removing intermediate container 0b4930768efb\n' },
	{
		stream:
			'Step 7/7 : RUN mkdir -p /auth && htpasswd -Bbn testuser testpassword >"/auth/htpasswd"\n',
	},
	{ stream: ' ---> Running in 26c5d7d4b475\n' },
	{ stream: ' ---> 71c5f44586ba\n' },
	{ stream: 'Removing intermediate container 26c5d7d4b475\n' },
	{ stream: 'Successfully built 71c5f44586ba\n' },
	{ stream: 'Successfully tagged private-registry-test:1\n' },
	{ status: 'Pulling from library/busybox', id: 'latest' },
	{ status: 'Pulling fs layer', progressDetail: {}, id: '90e01955edcd' },
	{
		status: 'Downloading',
		progressDetail: { current: 8214, total: 727978 },
		progress:
			'[>                                                  ]  8.214kB/728kB',
		id: '90e01955edcd',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 404239, total: 727978 },
		progress:
			'[===========================>                       ]  404.2kB/728kB',
		id: '90e01955edcd',
	},
	{
		status: 'Downloading',
		progressDetail: { current: 727978, total: 727978 },
		progress:
			'[==================================================>]    728kB/728kB',
		id: '90e01955edcd',
	},
	{ status: 'Verifying Checksum', progressDetail: {}, id: '90e01955edcd' },
	{ status: 'Download complete', progressDetail: {}, id: '90e01955edcd' },
	{
		status: 'Extracting',
		progressDetail: { current: 32768, total: 727978 },
		progress:
			'[==>                                                ]  32.77kB/728kB',
		id: '90e01955edcd',
	},
	{
		status: 'Extracting',
		progressDetail: { current: 727978, total: 727978 },
		progress:
			'[==================================================>]    728kB/728kB',
		id: '90e01955edcd',
	},
	{ status: 'Pull complete', progressDetail: {}, id: '90e01955edcd' },
	{
		status:
			'Digest: sha256:2a03a6059f21e150ae84b0973863609494aad70f0a80eaeb64bddd8d92465812',
	},
	{ status: 'Status: Downloaded newer image for busybox:latest' },
	{ status: 'The push refers to a repository [127.0.0.1:55055/busybox]' },
	{ status: 'Preparing', progressDetail: {}, id: '8a788232037e' },
	{
		status: 'Pushing',
		progressDetail: { current: 33792, total: 1154353 },
		progress:
			'[=>                                                 ]  33.79kB/1.154MB',
		id: '8a788232037e',
	},
	{
		status: 'Pushing',
		progressDetail: { current: 1369600, total: 1154353 },
		progress: '[==================================================>]   1.37MB',
		id: '8a788232037e',
	},
	{ status: 'Pushed', progressDetail: {}, id: '8a788232037e' },
	{
		status:
			'latest: digest: sha256:e2d9acbe92a6def141a9f9f2584468206735308df6a696430e25947882385fb2 size: 527',
	},
	{
		progressDetail: {},
		aux: {
			Tag: 'latest',
			Digest:
				'sha256:e2d9acbe92a6def141a9f9f2584468206735308df6a696430e25947882385fb2',
			Size: 527,
		},
	},
];

export function* sampleDaemonOutputGenerator(): IterableIterator<string> {
	for (const step of sampleDaemonOutput) {
		yield JSON.stringify(step);
	}
}

export function* sampleDaemonStreamGenerator(): IterableIterator<string> {
	for (const step of sampleDaemonOutput.filter((stepp) => stepp.stream)) {
		yield step.stream;
	}
}
