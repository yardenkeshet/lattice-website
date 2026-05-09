

const TileOption = ({ value }) => {
  // useLoader automatically handles async loading

  return (
    <option value={value}>
      {value}
    </option>
  )
}
export default TileOption;