const React = require('react')
const e = React.createElement
const Component = React.Component
const bindActionCreators = require('redux').bindActionCreators
const connect = require('react-redux').connect
const Dialog = require('material-ui/Dialog').default
const RadioButton = require('material-ui/RadioButton').RadioButton
const RadioButtonGroup = require('material-ui/RadioButton').RadioButtonGroup
const IconAdd = require('material-ui/svg-icons/content/add-box').default
const FlatButton = require('material-ui/FlatButton').default
const TextField = require('material-ui/TextField').default
const Tabs = require('material-ui/Tabs').Tabs
const Tab = require('material-ui/Tabs').Tab
const ProjectsActions = require('../actions/projects')
const StatusActions = require('../actions/status')
const LoadingActions = require('../actions/loading')
const dialog = require('electron').remote.dialog
const path = require('path')
const fsp = require('fs-promise')
const nodegit = require('../utils/nodegit').nodegit
const remoteCallbacks = require('../utils/remoteCallbacks')
const FloatingActionButton = require('material-ui/FloatingActionButton').default
const ContentAdd = require('material-ui/svg-icons/content/add').default
const log = require('../utils/log')

const TAB_URL   = 'TAB_URL'
const TAB_LOCAL = 'TAB_LOCAL'

class ProjectAdd extends Component {

	constructor(props) {
		super(props)

		this.state = {
			openAddModal: false,
			directoryPath: '',
			url: '',
			active: TAB_LOCAL,
			directoryModal: false,
		}
	}

	getDirectory() {
		this.setState(Object.assign({}, this.state, { directoryModal: true }))
		setTimeout(() => {
			const dialogDirectories = dialog.showOpenDialog({properties: ['openDirectory']})
			if (dialogDirectories) {
				const repoDirectory = dialogDirectories[0]
				this.handlePathChange(null, repoDirectory)
			}
			this.setState(Object.assign({}, this.state, { directoryModal: false }))
		}, 1)
	}

	setActiveTab(active) {
		const newState = Object.assign({}, this.state, { active })
		this.setState(newState)
	}

	handlePathChange(e, value) {
		const newState = Object.assign({}, this.state, { directoryPath: value })
		this.setState(newState)
	}

	handleURLChange(e, value) {
		const newState = Object.assign({}, this.state, { url: value })
		this.setState(newState)
	}

	prependProject(project) {
		const newProjects = [project].concat(this.props.projects.list)
		this.props.actions.projects.setProjects(newProjects)
	}

	getURLField() {
		return (
			e(
				TextField,
				{
					name: 'url',
					type: 'url',
					hintText: 'Adresa repozitáře',
					value: this.state.url,
					onChange: this.handleURLChange.bind(this),
				}
			)
		)
	}

	getDirectoryField() {
		return (
			e(
				'div',
				null,
				e(
					TextField,
					{
						name: 'path',
						hintText: 'Umístění v tomto zařízení',
						value: this.state.directoryPath,
						onChange: this.handlePathChange.bind(this),
					}
				),
				e(
					FlatButton,
					{
						label: 'Zvolit adresář',
						style: {
							verticalAlign: 'middle',
						},
						onTouchTap: this.getDirectory.bind(this),
					}
				)
			)
		)
	}

	openAddModal(open) {
		const newState = Object.assign({}, this.state, { openAddModal: open })
		this.setState(newState)
	}

	addProject() {
		const url = this.state.url
		const localPath = this.state.directoryPath
		const project = {
			name: path.basename(localPath),
			note: localPath,
			path: localPath,
			key: Date.now(),
			stats: {
				additions: 0,
				removals: 0,
				files: 0,
			},
		}
		this.openAddModal(false)

		this.props.actions.loading.IncrementLoadingJobs()
		Promise.resolve()
			.then(() => {
				if (this.state.active === TAB_LOCAL) {
					return this.prepareLocalProject(localPath)
				} else if (this.state.active === TAB_URL) {
					return this.prepareUrlProject(localPath, url)
				}
			})
			.then(() => {
				this.prependProject(project)
				this.props.actions.status.addStatus(
					`Byl přidán projekt: ${project.name}`,
					'Vrátit zpět',
					() => {
						this.props.actions.projects.removeProject(project)
					}
				)
				this.props.actions.projects.setActiveProject(project)
			})
			.catch((error) => {
				log.error(error)
			})
			.then(() => {
				this.props.actions.loading.DecrementLoadingJobs()
			})
	}


	prepareLocalProject(path) {
		let errorMessage = null
		return Promise.resolve()
			.then(() => {
				return fsp.stat(path)
					.catch((error) => {
						console.warn(error)
						errorMessage = 'Umístění projektu nenalezeno'
						throw new Error('Location not found.')
					})
			})
			.then(() => {
				return nodegit.Repository.open(path)
					.catch((error) => {
						console.warn(error)
						this.props.actions.status.addStatus(
							'Umístění neobsahuje projekt'
						)
						errorMessage = 'Použijte dřívě vytvořený'
						throw new Error('Invalid location.')
					})
			})
			.catch((error) => {
				if (errorMessage) {
					this.props.actions.status.addStatus(
						errorMessage
					)
				}
				throw error
			})
	}


	prepareUrlProject(path, url) {
		let errorMessage = null
		const trimmedUrl = url.trim()
		let repo
		return Promise.resolve()
			.then(() => {
				return fsp.ensureDir(path)
					.catch((error) => {
						console.warn(error)
						errorMessage = 'Umístění nenalezeno'
						throw new Error('Location not found.')
					})
			})
			.then(() => {
				return fsp.readdir(path)
					.then((files) => {
						if (files.length > 0) {
							errorMessage = 'Umístění není prázdné'
							throw new Error('Location not empty.')
						}
					})
			})
			.then(() => {
				if (trimmedUrl.length === 0) {
					errorMessage = 'Url musí být vyplněné'
					throw new Error('Empty url field.')
				}
			})
			.then(() => {
				return nodegit.Repository.init(path, 0)
					.then((r) => repo = r)
					.then(() => nodegit.Remote.create(repo, 'origin', trimmedUrl))
					.catch((error) => {
						console.warn(error)
						errorMessage = 'Projekt se nepodařilo vytvořit'
						throw new Error('Unable to init repository.')
					})
			})
			.catch((error) => {
				if (errorMessage) {
					this.props.actions.status.addStatus(
						errorMessage
					)
				}
				return fsp.emptyDir(path)
					.then(() => {
						throw error
					})
			})
	}


	render() {
		const actions = [
			e(
				FlatButton,
				{
					label: "Přidat",
					primary: true,
					onTouchTap: this.addProject.bind(this),
				}
			),
			e(
				FlatButton,
				{
					label: "Zrušit",
					onTouchTap: () => this.openAddModal(false),
				}
			),
		]

		return (
			e(
				'div',
				null,
				this.state.directoryModal ? e(
					'div',
					{
						style: {
							position: 'fixed',
							top: 0,
							left: 0,
							right: 0,
							bottom: 0,
							zIndex: 10000,
							backgroundColor: 'rgba(0,0,0,0.5)',
						}
					}
				) : null,
				e(
					Dialog,
					{
						actions: actions,
						onRequestClose: () => this.openAddModal(false),
						open: this.state.openAddModal,
					},
					e(
						Tabs,
						{
							initialSelectedIndex: this.state.active === TAB_LOCAL ? 0 : 1,
						},
						e(
							Tab,
							{
								label: "Z adresáře",
								onActive: () => this.setActiveTab(TAB_LOCAL),
							},
							e(
								'div',
								null,
								e('p', null, 'Zvolte adresář, který obsahuje již existující projekt.'),
								this.getDirectoryField()
							)
						),
						e(
							Tab,
							{
								label: "Z URL",
								onActive: () => this.setActiveTab(TAB_URL),
							},
							e(
								'div',
								null,
								e('p', null, 'Zvolte adresu, ze které se stáhne existující projekt do místního adresáře. Stahování může nějakou dobu trvat.'),
								this.getURLField(),
								this.getDirectoryField()
							)
						)
					)
				),
				e(
					FloatingActionButton,
					{
						onTouchTap: () => this.openAddModal(true),
						style: {
							position: 'fixed',
							right: 50,
							bottom: 50,
							zIndex: 2,
						},
					},
					e(ContentAdd)
				)
			)
		)
	}
}


function mapStateToProps(state) {
	return {
		projects: state.projects,
	}
}

function mapDispatchToProps(dispatch) {
	return {
		actions: {
			projects: bindActionCreators(ProjectsActions, dispatch),
			status: bindActionCreators(StatusActions, dispatch),
			loading: bindActionCreators(LoadingActions, dispatch),
		}
	}
}

module.exports = connect(mapStateToProps, mapDispatchToProps)(ProjectAdd)
